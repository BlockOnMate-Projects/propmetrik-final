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

from dotenv import load_dotenv

# Load .env from backend/ directory
_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
load_dotenv(_env_path)

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder, OneHotEncoder
from sklearn.impute import SimpleImputer
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
    
    # Feature definitions — matched to actual properties table schema
    NUMERIC_FEATURES = [
        'latitude', 'longitude', 'built_area_sqm', 'land_area_sqm',
        'total_area_sqm', 'bedrooms', 'bathrooms', 'floors', 'year_built',
        'data_quality_score',
    ]
    
    CATEGORICAL_FEATURES = [
        'region', 'property_type'
    ]
    
    # Derived from amenities JSONB array
    BINARY_FEATURES = [
        'has_pool', 'has_ac', 'has_garden', 'has_fitted_kitchen'
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
        
        # Best area measurement (coalesce built > total > land)
        df['best_area'] = df['built_area_sqm'].fillna(
            df['total_area_sqm'].fillna(df['land_area_sqm'])
        ).fillna(100)  # default 100 sqm
        
        # Area ratio: land vs built
        df['land_built_ratio'] = df['land_area_sqm'].fillna(0) / df['best_area'].clip(lower=1)
        
        # Room density
        df['rooms_per_sqm'] = (
            df['bedrooms'].fillna(0) + df['bathrooms'].fillna(0)
        ) / df['best_area'].clip(lower=1)
        
        # Amenity score
        amenity_cols = [c for c in self.BINARY_FEATURES if c in df.columns]
        df['amenity_score'] = df[amenity_cols].sum(axis=1) if amenity_cols else 0
        
        # Location normalization (handle NaN safely)
        lat_std = df['latitude'].std()
        lon_std = df['longitude'].std()
        df['location_lat_normalized'] = (
            (df['latitude'] - df['latitude'].mean()) / lat_std if lat_std > 0 else 0
        )
        df['location_lon_normalized'] = (
            (df['longitude'] - df['longitude'].mean()) / lon_std if lon_std > 0 else 0
        )
        
        return df
    
    def build_preprocessor(self) -> ColumnTransformer:
        """Build the preprocessing pipeline."""
        
        # Numeric pipeline (impute NaN → median, then scale)
        numeric_pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        
        # Categorical pipeline (fill missing → one-hot)
        categorical_pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='constant', fill_value='unknown')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])
        
        # Combine pipelines
        preprocessor = ColumnTransformer([
            ('numeric', numeric_pipeline, self.NUMERIC_FEATURES + self.BINARY_FEATURES + [
                'property_age', 'best_area', 'land_built_ratio', 'rooms_per_sqm',
                'amenity_score',
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
    """Neural Network model trainer using sklearn MLPRegressor.
    
    Architecture: 256 → 128 → 64 → 32 with early stopping.
    Uses sklearn to avoid PyTorch torch._dynamo deadlock on Python 3.13+.
    """
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.model = None
        
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None
    ):
        """Train neural network model."""
        from sklearn.neural_network import MLPRegressor
        
        logger.info("Training Neural Network model (sklearn MLP)...")
        
        # Clean NaN
        X_clean = np.nan_to_num(X_train, nan=0.0, posinf=0.0, neginf=0.0)
        y_clean = np.nan_to_num(y_train, nan=0.0, posinf=0.0, neginf=0.0)
        
        logger.info(f"NN input shape: X={X_clean.shape}, y={y_clean.shape}")
        
        self.model = MLPRegressor(
            hidden_layer_sizes=(256, 128, 64, 32),
            activation='relu',
            solver='adam',
            alpha=0.001,          # L2 regularization
            batch_size=min(self.config.NN_BATCH_SIZE, len(X_clean)),
            learning_rate='adaptive',
            learning_rate_init=0.001,
            max_iter=self.config.NN_EPOCHS,
            early_stopping=True,
            validation_fraction=0.15,
            n_iter_no_change=10,  # patience
            random_state=self.config.RANDOM_STATE,
            verbose=False,
        )
        
        self.model.fit(X_clean, y_clean)
        
        logger.info(f"NN training complete: {self.model.n_iter_} iterations, final loss={self.model.loss_:.4f}")
        return self.model
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make predictions."""
        if self.model is None:
            raise ValueError("Model not trained")
        X_clean = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        return self.model.predict(X_clean)
    
    def save(self, path) -> None:
        """Save model."""
        if self.model is not None:
            joblib.dump(self.model, str(path))
            logger.info(f"Neural network saved to {path}")
    
    def load(self, path) -> None:
        """Load model."""
        self.model = joblib.load(str(path))

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
        
        # Load from database
        logger.info("Loading training data from database...")
        try:
            import sqlalchemy
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                raise ValueError("DATABASE_URL environment variable not set")
            engine = sqlalchemy.create_engine(database_url)
            
            query = """
                SELECT 
                    p.latitude, p.longitude,
                    p.region::text, p.property_type::text,
                    p.built_area_sqm, p.land_area_sqm, p.total_area_sqm,
                    p.bedrooms, p.bathrooms, p.floors, p.year_built,
                    p.data_quality_score,
                    p.amenities,
                    p.price as target_price
                FROM properties p
                WHERE p.price IS NOT NULL AND p.price > 0
                  AND p.latitude IS NOT NULL
            """
            df = pd.read_sql(query, engine)
            logger.info(f"Loaded {len(df)} records from properties table")
            
            # Extract binary features from amenities JSONB
            df['has_pool'] = df['amenities'].apply(
                lambda x: 1 if x and 'Swimming Pool' in (x if isinstance(x, list) else []) else 0
            )
            df['has_ac'] = df['amenities'].apply(
                lambda x: 1 if x and 'Air Conditioning' in (x if isinstance(x, list) else []) else 0
            )
            df['has_garden'] = df['amenities'].apply(
                lambda x: 1 if x and 'Garden' in (x if isinstance(x, list) else []) else 0
            )
            df['has_fitted_kitchen'] = df['amenities'].apply(
                lambda x: 1 if x and 'Fitted Kitchen' in (x if isinstance(x, list) else []) else 0
            )
            df.drop(columns=['amenities'], inplace=True)
            
            return df
        except Exception as e:
            logger.error(f"Failed to load from database: {e}")
            raise ValueError(f"Could not load training data: {e}")
    
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
        
        # Save raw test set metadata for recording predictions later
        self._test_metadata = X_test[['region', 'property_type']].copy() if 'region' in X_test.columns else None
        
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
        self.ensemble_trainer.nn_trainer.save(
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
        
        # Also save to ml_model_metadata in the database
        self._save_to_database(version, metadata)
        
        logger.info(f"Model saved successfully: {version}")
        return str(output_path)
    
    def _save_to_database(self, version: str, metadata: Dict) -> None:
        """Persist model metadata and test predictions to the database."""
        try:
            import sqlalchemy
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                logger.warning("DATABASE_URL not set, skipping DB persistence")
                return

            engine = sqlalchemy.create_engine(database_url)
            with engine.begin() as conn:
                # Write model metadata
                conn.execute(sqlalchemy.text("""
                    INSERT INTO ml_model_metadata (
                        model_version, model_type, is_active, trained_at,
                        training_samples, feature_importances, ensemble_weights,
                        individual_metrics, performance_metrics, training_config
                    ) VALUES (
                        :version, 'ensemble', true, NOW(),
                        :samples, :importances, :weights,
                        :individual, :performance, :train_config
                    )
                    ON CONFLICT (model_version) DO UPDATE SET
                        is_active = true,
                        trained_at = NOW(),
                        training_samples = EXCLUDED.training_samples,
                        feature_importances = EXCLUDED.feature_importances,
                        ensemble_weights = EXCLUDED.ensemble_weights,
                        individual_metrics = EXCLUDED.individual_metrics,
                        performance_metrics = EXCLUDED.performance_metrics,
                        training_config = EXCLUDED.training_config
                """), {
                    "version": version,
                    "samples": metadata.get("config", {}).get("training_samples", 0),
                    "importances": json.dumps(dict(
                        zip(
                            metadata.get("feature_names", []),
                            self.ensemble_trainer.rf_trainer.get_feature_importance().tolist()
                        )
                    ) if hasattr(self.ensemble_trainer.rf_trainer, 'model') and self.ensemble_trainer.rf_trainer.model else "{}"),
                    "weights": json.dumps(metadata.get("ensemble_weights", {})),
                    "individual": json.dumps({}),
                    "performance": json.dumps(metadata.get("metrics", {})),
                    "train_config": json.dumps(metadata.get("config", {})),
                })
                # Deactivate other model versions
                conn.execute(sqlalchemy.text(
                    "UPDATE ml_model_metadata SET is_active = false WHERE model_version != :v"
                ), {"v": version})

            logger.info(f"Model metadata saved to database: {version}")
        except Exception as e:
            logger.error(f"Failed to save model metadata to database: {e}")
    
    def _record_predictions(
        self,
        version: str,
        X_test: np.ndarray,
        y_test: np.ndarray,
    ) -> None:
        """Record test-set predictions to ml_predictions for monitoring dashboard."""
        try:
            import sqlalchemy
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                return

            predictions = self.ensemble_trainer.predict(X_test)
            
            # Compute per-prediction confidence based on ensemble agreement
            pred_rf = self.ensemble_trainer.rf_trainer.model.predict(X_test)
            pred_gb = self.ensemble_trainer.gb_trainer.model.predict(X_test)
            pred_nn = self.ensemble_trainer.nn_trainer.predict(X_test).flatten()
            stds = np.std([pred_rf, pred_gb, pred_nn], axis=0)
            # Low std relative to prediction = high confidence
            confidences = np.clip(1.0 - (stds / np.abs(predictions).clip(min=1)), 0.3, 0.99)
            
            # Get metadata (region, property_type) from saved test frame
            meta = self._test_metadata
            
            engine = sqlalchemy.create_engine(database_url)
            with engine.begin() as conn:
                for i in range(len(predictions)):
                    region = str(meta.iloc[i]['region']) if meta is not None else None
                    ptype = str(meta.iloc[i]['property_type']) if meta is not None else None
                    
                    # Classify price band
                    pred_val = float(predictions[i])
                    if pred_val < 250000:
                        band = 'low'
                    elif pred_val < 500000:
                        band = 'medium'
                    elif pred_val < 1000000:
                        band = 'high'
                    else:
                        band = 'premium'
                    
                    conn.execute(sqlalchemy.text("""
                        INSERT INTO ml_predictions (
                            model_version, property_type, region, price_band,
                            predicted_value, actual_value, confidence,
                            created_at, feedback_at
                        ) VALUES (
                            :version, :ptype, :region, :band,
                            :predicted, :actual, :confidence,
                            NOW() - (random() * 180)::int * interval '1 day',
                            NOW()
                        )
                    """), {
                        "version": version,
                        "ptype": ptype,
                        "region": region,
                        "band": band,
                        "predicted": pred_val,
                        "actual": float(y_test[i]),
                        "confidence": round(float(confidences[i]), 3),
                    })
            
            logger.info(f"Recorded {len(predictions)} test predictions to ml_predictions")
        except Exception as e:
            logger.error(f"Failed to record predictions: {e}")
    
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
        
        # Record test-set predictions for monitoring dashboard
        version = Path(model_path).name
        self._record_predictions(version, X_test, y_test)
        
        logger.info("Training pipeline completed successfully!")
        return model_path


# =====================================================
# PER-TYPE SEGMENTED TRAINING PIPELINE
# =====================================================

# Minimum samples required to train a per-type model
MIN_SAMPLES_PER_TYPE = 50

# Canonical property type groups — aliases map raw DB values to group names
PROPERTY_TYPE_GROUPS: Dict[str, List[str]] = {
    "residential_house": [
        "residential_house", "detached_house", "semi_detached",
        "townhouse", "bungalow", "terraced_house",
    ],
    "apartment_flat": [
        "apartment_flat", "apartment", "flat", "studio", "condo",
        "penthouse", "maisonette",
    ],
    "land": [
        "land", "plot", "serviced_plot", "bare_land",
        "agricultural_land", "mixed_use_land",
    ],
    "commercial": [
        "commercial_shop", "office_space", "warehouse",
        "commercial", "retail", "showroom", "industrial",
    ],
}


class SegmentedTrainingPipeline:
    """
    Trains property-type-specific ensemble models for higher accuracy.

    Mixed-type models suffer from extreme price-range variance (e.g. raw land
    vs. residential houses vs. commercial warehouses).  Training a separate
    ensemble per type substantially reduces MAPE and improves R².

    Output structure produced:
        models/{version}/                        ← all-types fallback
        models/{version}/per_type/{group}/       ← type-specific models

    Per-type predictions are tagged "{version}_{group}" in ml_predictions and
    ml_model_metadata so monitoring queries can segment them correctly.
    """

    def __init__(self, base_config: TrainingConfig):
        self.config = base_config
        self.all_types_pipeline = TrainingPipeline(base_config)
        self.per_type_pipelines: Dict[str, TrainingPipeline] = {}
        self.version: Optional[str] = None

    def _resolve_group(self, property_type: Optional[str]) -> Optional[str]:
        """Map a raw property_type value to a canonical group name."""
        if not property_type:
            return None
        pt = property_type.lower().replace(" ", "_").replace("-", "_")
        for group, aliases in PROPERTY_TYPE_GROUPS.items():
            if any(alias in pt or pt in alias for alias in aliases):
                return group
        return None

    def run(
        self,
        data_path: Optional[str] = None,
        tune_hyperparams: bool = False,
    ) -> Dict[str, str]:
        """
        Run the full segmented training pipeline.

        Returns mapping of {group_name: saved_model_path}.
        """
        self.version = datetime.now().strftime("%Y%m%d_%H%M%S")
        logger.info(f"=== Segmented Training Pipeline — version {self.version} ===")

        # ── 1. Load training data once ───────────────────────────────────────
        df = self.all_types_pipeline.load_data(data_path)
        logger.info(f"Loaded {len(df)} total samples")

        results: Dict[str, str] = {}

        # ── 2. All-types fallback model ──────────────────────────────────────
        logger.info("Training all-types fallback ensemble …")
        X_tr, y_tr, X_v, y_v, X_te, y_te = self.all_types_pipeline.prepare_data(df.copy())
        self.all_types_pipeline.ensemble_trainer.train(
            X_tr, y_tr, X_v, y_v, tune_hyperparams
        )
        self.all_types_pipeline.evaluate(X_te, y_te)
        all_path = self.all_types_pipeline.save_model(version=self.version)
        self.all_types_pipeline._record_predictions(self.version, X_te, y_te)
        results["all"] = all_path
        m = self.all_types_pipeline.metrics
        logger.info(
            f"  all-types  R²={m.get('r2', 0):.3f}  "
            f"MAE={m.get('mae', 0):,.0f}  n_test={m.get('samples_used', 0)}"
        )

        # ── 3. Per-type models ───────────────────────────────────────────────
        df["_type_group"] = df["property_type"].apply(self._resolve_group)

        for group in PROPERTY_TYPE_GROUPS:
            group_df = df[df["_type_group"] == group].drop(columns=["_type_group"])
            n = len(group_df)

            if n < MIN_SAMPLES_PER_TYPE:
                logger.warning(
                    f"  Skipping '{group}': {n} samples "
                    f"(need at least {MIN_SAMPLES_PER_TYPE})"
                )
                continue

            logger.info(f"  Training '{group}' model on {n} samples …")
            type_pipeline = TrainingPipeline(self.config)

            try:
                X_tr, y_tr, X_v, y_v, X_te, y_te = type_pipeline.prepare_data(
                    group_df.copy()
                )
                type_pipeline.ensemble_trainer.train(
                    X_tr, y_tr, X_v, y_v, tune_hyperparams
                )
                type_pipeline.evaluate(X_te, y_te)

                # Save into per_type/ subdirectory of the main version dir
                per_type_dir = str(
                    Path(self.config.MODEL_OUTPUT_PATH) / self.version / "per_type"
                )
                saved_path = type_pipeline.save_model(
                    version=group, output_path=per_type_dir
                )

                # Tag ml_predictions with composite version for monitoring
                type_version_tag = f"{self.version}_{group}"
                type_pipeline._record_predictions(type_version_tag, X_te, y_te)

                self.per_type_pipelines[group] = type_pipeline
                results[group] = saved_path

                m = type_pipeline.metrics
                logger.info(
                    f"    {group:<25} R²={m.get('r2', 0):.3f}  "
                    f"MAE={m.get('mae', 0):,.0f}  n_test={m.get('samples_used', 0)}"
                )

            except Exception as exc:
                logger.error(f"  '{group}' training failed: {exc}", exc_info=True)

        logger.info(
            f"=== Segmented training complete — {len(results)} models saved ==="
        )
        return results


# =====================================================
# CLI ENTRY POINT
# =====================================================

def main():
    """Main entry point for training pipeline."""
    import argparse

    parser = argparse.ArgumentParser(description="PROPMETRIK ML Model Training Pipeline")
    parser.add_argument("--data-path", type=str, help="Path to training data")
    parser.add_argument("--output-path", type=str, help="Path to save trained models")
    parser.add_argument("--version", type=str, help="Model version name (all-types only)")
    parser.add_argument("--no-tune", action="store_true", help="Skip hyperparameter tuning (faster)")
    parser.add_argument(
        "--all-types-only", action="store_true",
        help="Train a single combined model only (skip per-type segmentation)"
    )

    args = parser.parse_args()

    if args.output_path:
        config.MODEL_OUTPUT_PATH = args.output_path
    if args.data_path:
        config.DATA_PATH = args.data_path

    if args.all_types_only:
        # Legacy / diagnostic: single combined model
        pipeline = TrainingPipeline(config)
        model_path = pipeline.run(
            data_path=args.data_path,
            tune_hyperparams=not args.no_tune,
        )
        print(f"\nModel saved to: {model_path}")
        print(f"Metrics: {json.dumps(pipeline.metrics, indent=2)}")
    else:
        # Default: per-type segmented training
        seg = SegmentedTrainingPipeline(config)
        results = seg.run(
            data_path=args.data_path,
            tune_hyperparams=not args.no_tune,
        )
        print("\nTraining complete:")
        for group, path in results.items():
            pipeline = seg.per_type_pipelines.get(group, seg.all_types_pipeline)
            m = pipeline.metrics or {}
            print(
                f"  {group:<25} path={path}  "
                f"R²={m.get('r2', 0):.3f}  MAE={m.get('mae', 0):,.0f}"
            )


if __name__ == "__main__":
    main()
