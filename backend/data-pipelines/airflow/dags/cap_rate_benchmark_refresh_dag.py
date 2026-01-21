"""
Cap Rate Benchmark Refresh DAG

This Airflow DAG runs weekly to update cap rate benchmarks from market data.
It implements the RICS-compliant fallback hierarchy:
  1. Market extraction (from transactions) - Category A
  2. Listing-derived (adjusted asking prices) - Category B

Schedule: Every Monday at 6:00 AM WAT (Ghana time)
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta
import logging
import subprocess
import json
import os

# ============================================================================
# CONFIGURATION
# ============================================================================

DAG_ID = 'cap_rate_benchmark_refresh'
DESCRIPTION = 'Weekly cap rate benchmark update from market data'
SCHEDULE = '0 6 * * 1'  # Every Monday at 6:00 AM

# Connection IDs (configure in Airflow Admin)
POSTGRES_CONN_ID = 'propmetrik_postgres'
BACKEND_PATH = '/app/backend'

default_args = {
    'owner': 'propmetrik-data',
    'depends_on_past': False,
    'email': ['valuation-ops@propmetrik.com', 'data-team@propmetrik.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=10),
    'execution_timeout': timedelta(hours=2),
}

REGIONS = [
    'greater_accra',
    'kumasi_metro', 
    'eastern',
    'western_cluster',
    'northern_cluster'
]

PROPERTY_TYPES = [
    'residential_house',
    'apartment_flat',
    'commercial_office',
    'commercial_shop',
    'warehouse',
    'mixed_use',
    'land',
    'industrial'
]

# ============================================================================
# TASK FUNCTIONS
# ============================================================================

def check_data_freshness(**kwargs):
    """
    Check if we have recent property data to derive cap rates from.
    Fail early if no recent listings exist.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    
    # Check listings in last 30 days
    result = hook.get_first("""
        SELECT 
            COUNT(*) as total_listings,
            COUNT(CASE WHEN transaction_type = 'sale' THEN 1 END) as sale_listings,
            COUNT(CASE WHEN transaction_type = 'rent' THEN 1 END) as rental_listings
        FROM properties
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND is_active = true
    """)
    
    total, sales, rentals = result
    
    logging.info(f"Data freshness check: {total} listings ({sales} sales, {rentals} rentals) in last 30 days")
    
    if total < 100:
        raise ValueError(f"Insufficient recent data: only {total} listings in last 30 days")
    
    if sales < 20:
        logging.warning(f"Low sale listings: {sales}. Cap rate derivation may be limited.")
    
    if rentals < 20:
        logging.warning(f"Low rental listings: {rentals}. NOI estimation may be limited.")
    
    # Store metrics for downstream tasks
    kwargs['ti'].xcom_push(key='data_freshness', value={
        'total_listings': total,
        'sale_listings': sales,
        'rental_listings': rentals,
        'checked_at': datetime.now().isoformat()
    })
    
    return True


def get_current_benchmark_stats(**kwargs):
    """
    Get current benchmark statistics before update.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    
    result = hook.get_records("""
        SELECT 
            methodology,
            COUNT(*) as count,
            AVG(benchmark_cap_rate)::float as avg_cap_rate,
            AVG(sample_size)::float as avg_sample_size,
            MAX(effective_date) as latest_update
        FROM market_cap_rate_benchmarks
        WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE
        GROUP BY methodology
    """)
    
    stats = {}
    for row in result:
        methodology, count, avg_rate, avg_sample, latest = row
        stats[methodology or 'unknown'] = {
            'count': count,
            'avg_cap_rate': round(avg_rate * 100, 2) if avg_rate else 0,
            'avg_sample_size': round(avg_sample) if avg_sample else 0,
            'latest_update': latest.isoformat() if latest else None
        }
    
    logging.info(f"Current benchmark stats: {json.dumps(stats, indent=2)}")
    kwargs['ti'].xcom_push(key='pre_update_stats', value=stats)
    
    return stats


def update_benchmarks_for_region(region: str, **kwargs):
    """
    Update cap rate benchmarks for a specific region.
    Runs the TypeScript script for each region.
    """
    logging.info(f"Updating benchmarks for region: {region}")
    
    # Run the update script
    result = subprocess.run(
        [
            'npx', 'ts-node', 
            'scripts/update-cap-rate-benchmarks.ts',
            f'--region={region}'
        ],
        cwd=BACKEND_PATH,
        capture_output=True,
        text=True,
        timeout=600  # 10 minute timeout per region
    )
    
    if result.returncode != 0:
        logging.error(f"Update failed for {region}: {result.stderr}")
        raise RuntimeError(f"Benchmark update failed for {region}")
    
    logging.info(f"Update completed for {region}: {result.stdout}")
    
    return {
        'region': region,
        'success': True,
        'output': result.stdout
    }


def run_full_benchmark_update(**kwargs):
    """
    Run full benchmark update for all regions and property types.
    """
    logging.info("Running full cap rate benchmark update")
    
    result = subprocess.run(
        [
            'npx', 'ts-node',
            'scripts/update-cap-rate-benchmarks.ts'
        ],
        cwd=BACKEND_PATH,
        capture_output=True,
        text=True,
        timeout=3600  # 1 hour timeout
    )
    
    if result.returncode != 0:
        logging.error(f"Full update failed: {result.stderr}")
        raise RuntimeError("Full benchmark update failed")
    
    logging.info(f"Full update completed:\n{result.stdout}")
    
    return {
        'success': True,
        'output': result.stdout
    }


def validate_benchmarks(**kwargs):
    """
    Validate that benchmarks were updated correctly.
    Check for anomalies and missing data.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    
    # Get updated benchmarks
    result = hook.get_records("""
        SELECT 
            region,
            property_type,
            benchmark_cap_rate,
            sample_size,
            methodology,
            effective_date
        FROM market_cap_rate_benchmarks
        WHERE effective_date = CURRENT_DATE
    """)
    
    updated_count = len(result)
    logging.info(f"Benchmarks updated today: {updated_count}")
    
    # Check for anomalies
    anomalies = []
    for row in result:
        region, ptype, cap_rate, sample, methodology, _ = row
        
        # Cap rate should be between 3% and 20%
        if cap_rate < 0.03 or cap_rate > 0.20:
            anomalies.append({
                'region': region,
                'property_type': ptype,
                'issue': f'Unusual cap rate: {cap_rate * 100:.2f}%'
            })
        
        # Sample size should be reasonable
        if sample < 3:
            anomalies.append({
                'region': region,
                'property_type': ptype,
                'issue': f'Low sample size: {sample}'
            })
    
    if anomalies:
        logging.warning(f"Found {len(anomalies)} anomalies: {json.dumps(anomalies, indent=2)}")
    
    # Check coverage
    expected_combinations = len(REGIONS) * len(PROPERTY_TYPES)
    coverage = hook.get_first("""
        SELECT COUNT(DISTINCT (region, property_type))
        FROM market_cap_rate_benchmarks
        WHERE (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    """)[0]
    
    coverage_pct = (coverage / expected_combinations) * 100
    logging.info(f"Benchmark coverage: {coverage}/{expected_combinations} ({coverage_pct:.1f}%)")
    
    kwargs['ti'].xcom_push(key='validation_results', value={
        'updated_today': updated_count,
        'anomalies': anomalies,
        'total_coverage': coverage,
        'coverage_percentage': coverage_pct
    })
    
    return {
        'updated_count': updated_count,
        'anomalies': len(anomalies),
        'coverage': coverage_pct
    }


def generate_summary_report(**kwargs):
    """
    Generate a summary report of the update run.
    """
    ti = kwargs['ti']
    
    pre_stats = ti.xcom_pull(key='pre_update_stats', task_ids='get_current_stats')
    validation = ti.xcom_pull(key='validation_results', task_ids='validate_benchmarks')
    data_freshness = ti.xcom_pull(key='data_freshness', task_ids='check_data_freshness')
    
    report = {
        'execution_date': kwargs['execution_date'].isoformat(),
        'dag_run_id': kwargs['run_id'],
        'data_freshness': data_freshness,
        'pre_update_stats': pre_stats,
        'validation': validation,
        'status': 'SUCCESS' if validation and validation.get('anomalies', 0) == 0 else 'COMPLETED_WITH_WARNINGS'
    }
    
    logging.info(f"Cap Rate Benchmark Update Report:\n{json.dumps(report, indent=2)}")
    
    return report


def cleanup_expired_benchmarks(**kwargs):
    """
    Archive or remove expired benchmarks.
    """
    hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
    
    # Count expired
    expired_count = hook.get_first("""
        SELECT COUNT(*) FROM market_cap_rate_benchmarks
        WHERE expiry_date < CURRENT_DATE
    """)[0]
    
    if expired_count > 0:
        logging.info(f"Found {expired_count} expired benchmarks")
        
        # Archive to history table (if exists) or just delete
        hook.run("""
            DELETE FROM market_cap_rate_benchmarks
            WHERE expiry_date < CURRENT_DATE - INTERVAL '30 days'
        """)
        
        logging.info("Cleaned up old expired benchmarks")
    
    return {'expired_removed': expired_count}


# ============================================================================
# DAG DEFINITION
# ============================================================================

with DAG(
    dag_id=DAG_ID,
    default_args=default_args,
    description=DESCRIPTION,
    schedule_interval=SCHEDULE,
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=['valuation', 'cap-rate', 'benchmarks', 'weekly'],
    doc_md=__doc__
) as dag:

    # Task 1: Check data freshness
    check_freshness = PythonOperator(
        task_id='check_data_freshness',
        python_callable=check_data_freshness,
        provide_context=True
    )

    # Task 2: Get current stats (for comparison)
    get_stats = PythonOperator(
        task_id='get_current_stats',
        python_callable=get_current_benchmark_stats,
        provide_context=True
    )

    # Task 3: Run full benchmark update
    run_update = PythonOperator(
        task_id='run_benchmark_update',
        python_callable=run_full_benchmark_update,
        provide_context=True,
        execution_timeout=timedelta(hours=1)
    )

    # Task 4: Validate results
    validate = PythonOperator(
        task_id='validate_benchmarks',
        python_callable=validate_benchmarks,
        provide_context=True
    )

    # Task 5: Cleanup expired
    cleanup = PythonOperator(
        task_id='cleanup_expired',
        python_callable=cleanup_expired_benchmarks,
        provide_context=True
    )

    # Task 6: Generate report
    report = PythonOperator(
        task_id='generate_report',
        python_callable=generate_summary_report,
        provide_context=True
    )

    # Define task dependencies
    check_freshness >> get_stats >> run_update >> validate >> cleanup >> report
