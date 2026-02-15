"""
PROPMETRIK ML Model Training Pipeline

Comprehensive training pipeline for property valuation ensemble models.
Trains Random Forest, Gradient Boosting, and Neural Network models
with cross-validation and hyperparameter tuning.

Features:
- Data preprocessing with feature engineering
- Multiple model training (RF, XGBoost, NN)
- Cross-validation and hyperparameter optimization
- Model ensembling with learned weights
- Feature importance analysis
- Model versioning and artifact management
"""

import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import pickle

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb
import joblib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURATION
# =====================================================

class TrainingConfig:
    """Training configuration."""
    # Data paths
    DATA_PATH = os.getenv("DATA_PATH", "./data")
    MODEL_OUTPUT_PATH = os.getenv("MODEL_OUTPUT_PATH", "./models")
    
    # Training settings
    TEST_SIZE = float(os.getenv("TEST_SIZE", "0.2"))
    RANDOM_STATE = int(os.getenv("RANDOM_STATE", "42"))
    CV_FOLDS = int(os.getenv("CV_FOLDS", "5"))
    
    # Model hyperparameters
    RF_N_ESTIMATORS = int(os.getenv("RF_N_ESTIMATORS", "200"))
    RF_MAX_DEPTH = int(os.getenv("RF_MAX_DEPTH", "20"))
    
    GB_N_ESTIMATORS = int(os.getenv("GB_N_ESTIMATORS", "200"))
    GB_LEARNING_RATE = float(os.getenv("GB_LEARNING_RATE", "0.1"))
    GB_MAX_DEPTH = int(os.getenv("GB_MAX_DEPTH", "10"))
    
    # Neural Network settings
    NN_EPOCHS = int(os.getenv("NN_EPOCHS", "100"))
    NN_BATCH_SIZE = int(os.getenv("NN_BATCH_SIZE", "64"))

config = TrainingConfig()

# =====================================================
# FEATURE ENGINEERING
# =====================================================

class FeatureEngineer:
    """
    Handles feature engineering for property valuation.
    Creates derived features and handles categorical encoding.
    """
    
    # Feature definitions
    NUMERIC_FEATURES = [
        'latitude', 'longitude', 'built_area_sqm', 'plot_area_sqm',
        'bedrooms', 'bathrooms', 'floors', 'year_built',
        'condition_score', 'quality_score',
        'building_efficiency', 'layout_quality_score',
        'inflation_rate', 'exchange_rate_usd'
    ]
    
    CATEGORICAL_FEATURES = [
        'region', 'district', 'property_type'
    ]
    
    BINARY_FEATURES = [
        'has_parking', 'has_security', 'has_pool',
        'has_generator', 'has_borehole'
    ]
    
    def __init__(self):
        self.label_encoders: Dict[str, LabelEncoder] = {}
        self.scaler = StandardScaler()
        self.is_fitted = False
        
    def create_derived_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create derived features from raw data."""
        df = df.copy()
        
        # Age-based features
        current_year = datetime.now().year
        df['property_age'] = current_year - df['year_built'].fillna(2000)
        df['property_age_squared'] = df['property_age'] ** 2
        
        # Area-based features
        df['price_per_sqm_built'] = df.get('price', 0) / df['built_area_sqm'].clip(lower=1)
        df['plot_built_ratio'] = df['plot_area_sqm'] / df['built_area_sqm'].clip(lower=1)
        
        # Room density
        df['rooms_per_sqm'] = (df['bedrooms'] + df['bathrooms']) / df['built_area_sqm'].clip(lower=1)
        
        # Amenity score
        amenity_cols = self.BINARY_FEATURES
        df['amenity_score'] = df[amenity_cols].sum(axis=1)
        
        # Location value indicator (could be enhanced with actual location data)
        df['location_lat_normalized'] = (df['latitude'] - df['latitude'].mean()) / df['latitude'].std()
        df['location_lon_normalized'] = (df['longitude'] - df['longitude'].mean()) / df['longitude'].std()
        
        # Quality index
        df['quality_index'] = (df['condition_score'] + df['quality_score']) / 2
        
        # Efficiency-adjusted area
        df['effective_area'] = df['built_area_sqm'] * df['building_efficiency'].fillna(0.85)
        
        return df
    
    def build_preprocessor(self) -> ColumnTransformer:
        """Build the preprocessing pipeline."""
        
        # Numeric pipeline
        numeric_pipeline = Pipeline([
            ('scaler', StandardScaler())
        ])
        
        # Categorical pipeline
        categorical_pipeline = Pipeline([
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])
        
        # Combine pipelines
        preprocessor = ColumnTransformer([
            ('numeric', numeric_pipeline, self.NUMERIC_FEATURES + self.BINARY_FEATURES + [
                'property_age', 'plot_built_ratio', 'rooms_per_sqm',
                'amenity_score', 'quality_index', 'effective_area'
            ]),
            ('categorical', categorical_pipeline, self.CATEGORICAL_FEATURES)
        ], remainder='drop')
        
        return preprocessor
    
    def fit_transform(self, df: pd.DataFrame) -> np.ndarray:
        """Fit the preprocessor and transform data."""
        df = self.create_derived_features(df)
        self.preprocessor = self.build_preprocessor()
        self.is_fitted = True
        return self.preprocessor.fit_transform(df)
    
    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """Transform data using fitted preprocessor."""
        if not self.is_fitted:
            raise ValueError("Preprocessor not fitted. Call fit_transform first.")
        df = self.create_derived_features(df)
        return self.preprocessor.transform(df)
    
    def get_feature_names(self) -> List[str]:
        """Get names of all features after transformation."""
        if not self.is_fitted:
            return []
        return self.preprocessor.get_feature_names_out().tolist()

# =====================================================
# MODEL TRAINERS
# =====================================================

class RandomForestTrainer:
    """Random Forest model trainer with hyperparameter tuning."""
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.model = None
        self.best_params = None
        
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        tune_hyperparams: bool = True
    ) -> RandomForestRegressor:
        """Train Random Forest model."""
        logger.info("Training Random Forest model...")
        
        if tune_hyperparams:
            param_grid = {
                'n_estimators': [100, 200, 300],
                'max_depth': [10, 20, 30, None],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4]
            }
            
            base_model = RandomForestRegressor(random_state=self.config.RANDOM_STATE)
            grid_search = GridSearchCV(
                base_model, param_grid,
                cv=self.config.CV_FOLDS,
                scoring='neg_mean_absolute_error',
                n_jobs=-1,
                verbose=1
            )
            grid_search.fit(X_train, y_train)
            
            self.model = grid_search.best_estimator_
            self.best_params = grid_search.best_params_
            logger.info(f"Best RF params: {self.best_params}")
        else:
            self.model = RandomForestRegressor(
                n_estimators=self.config.RF_N_ESTIMATORS,
                max_depth=self.config.RF_MAX_DEPTH,
                random_state=self.config.RANDOM_STATE,
                n_jobs=-1
            )
            self.model.fit(X_train, y_train)
        
        return self.model
    
    def get_feature_importance(self) -> np.ndarray:
        """Get feature importance from trained model."""
        if self.model is None:
            raise ValueError("Model not trained")
        return self.model.feature_importances_


class GradientBoostingTrainer:
    """Gradient Boosting (XGBoost) model trainer."""
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.model = None
        self.best_params = None
        
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        tune_hyperparams: bool = True
    ) -> xgb.XGBRegressor:
        """Train Gradient Boosting model."""
        logger.info("Training Gradient Boosting (XGBoost) model...")
        
        if tune_hyperparams:
            param_grid = {
                'n_estimators': [100, 200, 300],
                'max_depth': [5, 10, 15],
                'learning_rate': [0.01, 0.1, 0.2],
                'subsample': [0.8, 1.0],
                'colsample_bytree': [0.8, 1.0]
            }
            
            base_model = xgb.XGBRegressor(
                random_state=self.config.RANDOM_STATE,
                objective='reg:squarederror'
            )
            grid_search = GridSearchCV(
                base_model, param_grid,
                cv=self.config.CV_FOLDS,
                scoring='neg_mean_absolute_error',
                n_jobs=-1,
                verbose=1
            )
            grid_search.fit(X_train, y_train)
            
            self.model = grid_search.best_estimator_
            self.best_params = grid_search.best_params_
            logger.info(f"Best XGBoost params: {self.best_params}")
        else:
            self.model = xgb.XGBRegressor(
                n_estimators=self.config.GB_N_ESTIMATORS,
                max_depth=self.config.GB_MAX_DEPTH,
                learning_rate=self.config.GB_LEARNING_RATE,
                random_state=self.config.RANDOM_STATE,
                objective='reg:squarederror'
            )
            self.model.fit(X_train, y_train)
        
        return self.model
    
    def get_feature_importance(self) -> np.ndarray:
        """Get feature importance from trained model."""
        if self.model is None:
            raise ValueError("Model not trained")
        return self.model.feature_importances_


class NeuralNetworkTrainer:
    """Neural Network model trainer using TensorFlow."""
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.model = None
        self.history = None
        
    def build_model(self, input_dim: int):
        """Build neural network architecture."""
        from tensorflow import keras
        from tensorflow.keras import layers
        
        model = keras.Sequential([
            layers.Input(shape=(input_dim,)),
            layers.Dense(256, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.3),
            layers.Dense(128, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.2),
            layers.Dense(64, activation='relu'),
            layers.Dropout(0.1),
            layers.Dense(32, activation='relu'),
            layers.Dense(1, activation='linear')
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None
    ):
        """Train neural network model."""
        from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
        
        logger.info("Training Neural Network model...")
        
        self.model = self.build_model(X_train.shape[1])
        
        callbacks = [
            EarlyStopping(
                monitor='val_loss' if X_val is not None else 'loss',
                patience=10,
                restore_best_weights=True
            ),
            ReduceLROnPlateau(
                monitor='val_loss' if X_val is not None else 'loss',
                factor=0.5,
                patience=5
            )
        ]
        
        validation_data = (X_val, y_val) if X_val is not None else None
        
        self.history = self.model.fit(
            X_train, y_train,
            epochs=self.config.NN_EPOCHS,
            batch_size=self.config.NN_BATCH_SIZE,
            validation_data=validation_data,
            callbacks=callbacks,
            verbose=1
        )
        
        return self.model
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make predictions."""
        if self.model is None:
            raise ValueError("Model not trained")
        return self.model.predict(X, verbose=0)

# =====================================================
# ENSEMBLE TRAINER
# =====================================================

class EnsembleTrainer:
    """
    Trains an ensemble of models and learns optimal weights.
    Combines Random Forest, Gradient Boosting, and Neural Network.
    """
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.rf_trainer = RandomForestTrainer(config)
        self.gb_trainer = GradientBoostingTrainer(config)
        self.nn_trainer = NeuralNetworkTrainer(config)
        self.weights = {"random_forest": 0.4, "gradient_boosting": 0.35, "neural_network": 0.25}
        
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        tune_hyperparams: bool = True
    ) -> Dict:
        """Train all models in the ensemble."""
        logger.info("Training ensemble models...")
        
        # Train individual models
        rf_model = self.rf_trainer.train(X_train, y_train, tune_hyperparams)
        gb_model = self.gb_trainer.train(X_train, y_train, tune_hyperparams)
        nn_model = self.nn_trainer.train(X_train, y_train, X_val, y_val)
        
        # Learn optimal weights using validation set
        self.weights = self._learn_weights(X_val, y_val)
        
        return {
            "random_forest": rf_model,
            "gradient_boosting": gb_model,
            "neural_network": nn_model,
            "weights": self.weights
        }
    
    def _learn_weights(
        self,
        X_val: np.ndarray,
        y_val: np.ndarray
    ) -> Dict[str, float]:
        """Learn optimal ensemble weights using validation data."""
        logger.info("Learning optimal ensemble weights...")
        
        # Get predictions from each model
        pred_rf = self.rf_trainer.model.predict(X_val)
        pred_gb = self.gb_trainer.model.predict(X_val)
        pred_nn = self.nn_trainer.predict(X_val).flatten()
        
        # Grid search for optimal weights
        best_mae = float('inf')
        best_weights = self.weights.copy()
        
        for w_rf in np.arange(0.2, 0.6, 0.1):
            for w_gb in np.arange(0.2, 0.6, 0.1):
                w_nn = 1 - w_rf - w_gb
                if w_nn < 0.1 or w_nn > 0.5:
                    continue
                
                ensemble_pred = w_rf * pred_rf + w_gb * pred_gb + w_nn * pred_nn
                mae = mean_absolute_error(y_val, ensemble_pred)
                
                if mae < best_mae:
                    best_mae = mae
                    best_weights = {
                        "random_forest": float(w_rf),
                        "gradient_boosting": float(w_gb),
                        "neural_network": float(w_nn)
                    }
        
        logger.info(f"Optimal weights: {best_weights}")
        return best_weights
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make ensemble predictions."""
        pred_rf = self.rf_trainer.model.predict(X)
        pred_gb = self.gb_trainer.model.predict(X)
        pred_nn = self.nn_trainer.predict(X).flatten()
        
        return (
            self.weights["random_forest"] * pred_rf +
            self.weights["gradient_boosting"] * pred_gb +
            self.weights["neural_network"] * pred_nn
        )

# =====================================================
# MAIN TRAINING PIPELINE
# =====================================================

class TrainingPipeline:
    """
    End-to-end training pipeline.
    Handles data loading, preprocessing, training, evaluation, and saving.
    """
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.feature_engineer = FeatureEngineer()
        self.ensemble_trainer = EnsembleTrainer(config)
        self.metrics: Dict = {}
        
    def load_data(self, data_path: Optional[str] = None) -> pd.DataFrame:
        """Load training data from source."""
        path = data_path or self.config.DATA_PATH
        
        # Try different data sources
        if Path(path).is_file():
            if path.endswith('.csv'):
                return pd.read_csv(path)
            elif path.endswith('.parquet'):
                return pd.read_parquet(path)
        
        # Load from database if available
        logger.info("Attempting to load data from database...")
        try:
            import sqlalchemy
            engine = sqlalchemy.create_engine(os.getenv("DATABASE_URL"))
            
            query = """
                SELECT 
                    p.latitude, p.longitude,
                    p.region, p.district,
                    p.property_type, p.built_area_sqm, p.plot_area_sqm,
                    p.bedrooms, p.bathrooms, p.floors, p.year_built,
                    p.condition_score, p.quality_score,
                    p.has_parking, p.has_security, p.has_pool,
                    p.has_generator, p.has_borehole,
                    p.building_efficiency, p.layout_quality_score,
                    p.price as target_price
                FROM properties p
                WHERE p.price IS NOT NULL AND p.price > 0
                AND p.is_verified = true
            """
            return pd.read_sql(query, engine)
        except Exception as e:
            logger.error(f"Failed to load from database: {e}")
            raise ValueError("No valid data source found")
    
    def prepare_data(
        self,
        df: pd.DataFrame,
        target_col: str = 'target_price'
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Prepare data for training."""
        logger.info(f"Preparing data with {len(df)} samples...")
        
        # Remove outliers
        price_mean = df[target_col].mean()
        price_std = df[target_col].std()
        df = df[
            (df[target_col] > price_mean - 3 * price_std) &
            (df[target_col] < price_mean + 3 * price_std)
        ]
        
        # Split features and target
        X = df.drop(columns=[target_col])
        y = df[target_col].values
        
        # Train-test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=self.config.TEST_SIZE,
            random_state=self.config.RANDOM_STATE
        )
        
        # Further split training into train and validation
        X_train, X_val, y_train, y_val = train_test_split(
            X_train, y_train,
            test_size=0.2,
            random_state=self.config.RANDOM_STATE
        )
        
        logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
        
        # Preprocess features
        X_train_processed = self.feature_engineer.fit_transform(X_train)
        X_val_processed = self.feature_engineer.transform(X_val)
        X_test_processed = self.feature_engineer.transform(X_test)
        
        return (
            X_train_processed, y_train,
            X_val_processed, y_val,
            X_test_processed, y_test
        )
    
    def evaluate(
        self,
        X_test: np.ndarray,
        y_test: np.ndarray
    ) -> Dict[str, float]:
        """Evaluate the trained ensemble."""
        logger.info("Evaluating ensemble model...")
        
        predictions = self.ensemble_trainer.predict(X_test)
        
        self.metrics = {
            "mae": float(mean_absolute_error(y_test, predictions)),
            "rmse": float(np.sqrt(mean_squared_error(y_test, predictions))),
            "mape": float(np.mean(np.abs((y_test - predictions) / y_test)) * 100),
            "r2": float(r2_score(y_test, predictions)),
            "samples_used": int(len(y_test))
        }
        
        logger.info(f"Evaluation metrics: {self.metrics}")
        return self.metrics
    
    def save_model(
        self,
        version: Optional[str] = None,
        output_path: Optional[str] = None
    ) -> str:
        """Save trained models and artifacts."""
        version = version or datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = Path(output_path or self.config.MODEL_OUTPUT_PATH) / version
        output_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Saving model to {output_path}")
        
        # Save main model (ensemble predictor)
        joblib.dump(self.ensemble_trainer, output_path / "model.joblib")
        
        # Save preprocessor
        joblib.dump(self.feature_engineer, output_path / "preprocessor.joblib")
        
        # Save ensemble components separately
        ensemble_path = output_path / "ensemble"
        ensemble_path.mkdir(exist_ok=True)
        
        joblib.dump(
            self.ensemble_trainer.rf_trainer.model,
            ensemble_path / "random_forest.joblib"
        )
        joblib.dump(
            self.ensemble_trainer.gb_trainer.model,
            ensemble_path / "gradient_boosting.joblib"
        )
        self.ensemble_trainer.nn_trainer.model.save(
            ensemble_path / "neural_network.keras"
        )
        
        # Also save as joblib for compatibility
        joblib.dump(
            self.ensemble_trainer.nn_trainer.model,
            ensemble_path / "neural_network.joblib"
        )
        
        with open(ensemble_path / "weights.json", "w") as f:
            json.dump(self.ensemble_trainer.weights, f)
        
        # Save metadata
        metadata = {
            "name": "PROPMETRIK AVM",
            "version": version,
            "model_type": "ensemble",
            "trained_at": datetime.now().isoformat(),
            "metrics": self.metrics,
            "feature_names": self.feature_engineer.get_feature_names(),
            "ensemble_weights": self.ensemble_trainer.weights,
            "config": {
                "test_size": self.config.TEST_SIZE,
                "cv_folds": self.config.CV_FOLDS,
                "random_state": self.config.RANDOM_STATE
            }
        }
        
        with open(output_path / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Model saved successfully: {version}")
        return str(output_path)
    
    def run(
        self,
        data_path: Optional[str] = None,
        tune_hyperparams: bool = True
    ) -> str:
        """Run the complete training pipeline."""
        logger.info("Starting training pipeline...")
        
        # Load data
        df = self.load_data(data_path)
        
        # Prepare data
        (
            X_train, y_train,
            X_val, y_val,
            X_test, y_test
        ) = self.prepare_data(df)
        
        # Train ensemble
        self.ensemble_trainer.train(
            X_train, y_train,
            X_val, y_val,
            tune_hyperparams=tune_hyperparams
        )
        
        # Evaluate
        self.evaluate(X_test, y_test)
        
        # Save model
        model_path = self.save_model()
        
        logger.info("Training pipeline completed successfully!")
        return model_path

# =====================================================
# CLI ENTRY POINT
# =====================================================

def main():
    """Main entry point for training pipeline."""
    import argparse
    
    parser = argparse.ArgumentParser(description="PROPMETRIK ML Model Training Pipeline")
    parser.add_argument("--data-path", type=str, help="Path to training data")
    parser.add_argument("--output-path", type=str, help="Path to save trained models")
    parser.add_argument("--version", type=str, help="Model version name")
    parser.add_argument("--no-tune", action="store_true", help="Skip hyperparameter tuning")
    
    args = parser.parse_args()
    
    # Update config if paths provided
    if args.output_path:
        config.MODEL_OUTPUT_PATH = args.output_path
    if args.data_path:
        config.DATA_PATH = args.data_path
    
    # Run training
    pipeline = TrainingPipeline(config)
    model_path = pipeline.run(
        data_path=args.data_path,
        tune_hyperparams=not args.no_tune
    )
    
    print(f"\nModel saved to: {model_path}")
    print(f"Metrics: {json.dumps(pipeline.metrics, indent=2)}")

if __name__ == "__main__":
    main()
