-- Sample API Pull Integration Data
-- Demonstrates Phase 3 configuration for Ghana property data sources

-- Insert sample Tier 1 government API endpoints
INSERT INTO partner_api_endpoints (
    id,
    source_id,
    endpoint_name,
    endpoint_url,
    endpoint_type,
    auth_method,
    dataset_type,
    pull_frequency,
    pull_method,
    data_format,
    requests_per_minute,
    requests_per_hour,
    batch_fallback_enabled,
    batch_fallback_url,
    response_mapping,
    pagination_config,
    created_by
) VALUES 
-- Ghana Lands Commission - Land Records
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    (SELECT id FROM data_sources WHERE name = 'Ghana Lands Commission' LIMIT 1),
    'GLC Property Registrations API',
    'https://api.landscommission.gov.gh/v1/properties',
    'rest_api',
    'oauth2',
    'property_registrations',
    'daily',
    'incremental',
    'json',
    30,
    500,
    true,
    'sftp://data.landscommission.gov.gh/exports/properties/',
    '{
        "fields": {
            "property_id": "registration_number",
            "owner_name": "proprietor_name",
            "location": "property_location",
            "area_sqm": "total_area_square_meters",
            "registration_date": "date_registered",
            "property_type": "land_use_classification",
            "district": "administrative_district",
            "region": "administrative_region",
            "coordinates": {
                "latitude": "gps_coordinates.lat",
                "longitude": "gps_coordinates.lng"
            }
        }
    }',
    '{
        "method": "limit_offset",
        "limitParam": "page_size",
        "offsetParam": "offset",
        "defaultPageSize": 200,
        "maxPageSize": 500,
        "totalCountField": "total_records",
        "dataField": "properties"
    }',
    'system'
),

-- Town and Country Planning Department - Building Permits
(
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    (SELECT id FROM data_sources WHERE name = 'Town and Country Planning Dept' LIMIT 1),
    'TCPD Building Permits API',
    'https://api.tcpd.gov.gh/v2/permits',
    'rest_api',
    'oauth2',
    'building_permits',
    'daily',
    'incremental',
    'json',
    20,
    400,
    true,
    'https://data.tcpd.gov.gh/exports/permits/daily/',
    '{
        "fields": {
            "permit_id": "permit_reference",
            "applicant_name": "applicant_details.name",
            "property_address": "site_address",
            "permit_type": "development_type",
            "issue_date": "date_issued",
            "expiry_date": "expiry_date",
            "status": "permit_status",
            "estimated_cost": "project_cost_ghs",
            "district": "planning_district"
        }
    }',
    '{
        "method": "cursor",
        "cursorParam": "cursor",
        "defaultPageSize": 100,
        "maxPageSize": 250,
        "nextTokenField": "next_cursor",
        "dataField": "permits"
    }',
    'system'
),

-- Registrar General - Property Transactions
(
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    (SELECT id FROM data_sources WHERE name = 'Registrar General Dept' LIMIT 1),
    'RGD Property Transactions API',
    'https://api.rgd.gov.gh/v1/transactions',
    'rest_api',
    'oauth2',
    'property_transactions',
    'weekly',
    'full_sync',
    'json',
    15,
    200,
    true,
    'ftp://files.rgd.gov.gh/exports/transactions/',
    '{
        "fields": {
            "transaction_id": "deed_reference",
            "property_id": "property_reference",
            "transaction_type": "deed_type",
            "transaction_date": "registration_date",
            "sale_price_ghs": "consideration_amount",
            "buyer_name": "grantee_name",
            "seller_name": "grantor_name",
            "property_location": "property_description.location"
        }
    }',
    '{
        "method": "page_number",
        "pageParam": "page",
        "sizeParam": "size",
        "defaultPageSize": 50,
        "maxPageSize": 100,
        "totalCountField": "total_pages",
        "dataField": "transactions"
    }',
    'system'
),

-- Bank of Ghana - Mortgage Statistics (Tier 2 Financial)
(
    'd4e5f6g7-h8i9-0123-defg-456789012345',
    (SELECT id FROM data_sources WHERE name = 'Bank of Ghana' LIMIT 1),
    'BoG Mortgage Statistics API',
    'https://api.bog.gov.gh/v1/mortgage-stats',
    'rest_api',
    'mtls',
    'mortgage_statistics',
    'monthly',
    'full_sync',
    'json',
    5,
    50,
    false,
    null,
    '{
        "fields": {
            "reporting_period": "period",
            "total_mortgage_loans": "outstanding_mortgage_loans_ghs",
            "new_mortgage_approvals": "new_approvals_count",
            "average_loan_amount": "average_loan_size_ghs",
            "interest_rate_avg": "weighted_average_rate",
            "default_rate": "npl_ratio_percent",
            "regional_distribution": "regional_breakdown"
        }
    }',
    '{
        "method": "limit_offset",
        "limitParam": "limit",
        "offsetParam": "offset",
        "defaultPageSize": 50,
        "maxPageSize": 100,
        "dataField": "statistics"
    }',
    'system'
),

-- Ghana Statistical Service - Property Market Indicators
(
    'e5f6g7h8-i9j0-1234-efgh-567890123456',
    (SELECT id FROM data_sources WHERE name = 'Ghana Statistical Service' LIMIT 1),
    'GSS Property Market API',
    'https://api.statsghana.gov.gh/v1/property-indicators',
    'rest_api',
    'api_key',
    'market_indicators',
    'monthly',
    'incremental',
    'json',
    10,
    100,
    true,
    'https://data.statsghana.gov.gh/exports/property-market/',
    '{
        "fields": {
            "indicator_id": "metric_code",
            "indicator_name": "metric_description",
            "value": "metric_value",
            "period": "reporting_period",
            "region": "geographic_area",
            "unit": "measurement_unit",
            "source_note": "data_notes"
        }
    }',
    '{
        "method": "limit_offset",
        "limitParam": "per_page",
        "offsetParam": "page_offset",
        "defaultPageSize": 100,
        "maxPageSize": 200,
        "totalCountField": "total_indicators",
        "dataField": "indicators"
    }',
    'system'
);

-- Insert sample pull schedules for these endpoints
INSERT INTO api_pull_schedules (
    id,
    endpoint_id,
    schedule_name,
    cron_expression,
    timezone,
    is_active,
    sync_type,
    priority,
    execution_window_start,
    execution_window_end,
    max_execution_time_minutes,
    retry_failed_jobs,
    retry_delay_minutes,
    notify_on_failure,
    notification_channels
) VALUES 
-- Daily Ghana Lands Commission sync at 2:00 AM GMT
(
    'f6g7h8i9-j0k1-2345-fghi-678901234567',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'GLC Daily Property Registrations',
    '0 2 * * *',
    'Africa/Accra',
    true,
    'incremental',
    1, -- High priority for government data
    '01:00:00',
    '05:00:00',
    60,
    true,
    30,
    true,
    '["email", "slack"]'
),

-- Daily TCPD building permits at 2:30 AM GMT
(
    'g7h8i9j0-k1l2-3456-ghij-789012345678',
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    'TCPD Daily Building Permits',
    '30 2 * * *',
    'Africa/Accra',
    true,
    'incremental',
    2,
    '01:00:00',
    '05:00:00',
    45,
    true,
    30,
    true,
    '["email"]'
),

-- Weekly RGD transactions on Sundays at 3:00 AM GMT
(
    'h8i9j0k1-l2m3-4567-hijk-890123456789',
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    'RGD Weekly Property Transactions',
    '0 3 * * 0',
    'Africa/Accra',
    true,
    'full_sync',
    3,
    '02:00:00',
    '06:00:00',
    90,
    true,
    60,
    true,
    '["email", "webhook"]'
),

-- Monthly BoG mortgage statistics on 1st of month at 6:00 AM GMT
(
    'i9j0k1l2-m3n4-5678-ijkl-901234567890',
    'd4e5f6g7-h8i9-0123-defg-456789012345',
    'BoG Monthly Mortgage Statistics',
    '0 6 1 * *',
    'Africa/Accra',
    true,
    'full_sync',
    4,
    '06:00:00',
    '10:00:00',
    30,
    true,
    120,
    true,
    '["email", "slack", "webhook"]'
),

-- Monthly GSS property indicators on 5th of month at 4:00 AM GMT
(
    'j0k1l2m3-n4o5-6789-jklm-012345678901',
    'e5f6g7h8-i9j0-1234-efgh-567890123456',
    'GSS Monthly Property Market Indicators',
    '0 4 5 * *',
    'Africa/Accra',
    true,
    'incremental',
    5,
    '03:00:00',
    '07:00:00',
    45,
    true,
    60,
    true,
    '["email"]'
);

-- Insert sample health check configurations
INSERT INTO partner_health_checks (
    id,
    endpoint_id,
    status,
    response_time_ms,
    uptime_percentage,
    availability_24h,
    availability_7d,
    availability_30d,
    avg_response_time_ms,
    min_response_time_ms,
    max_response_time_ms,
    error_rate_24h,
    error_rate_7d,
    check_interval_minutes,
    timeout_seconds,
    expected_status_codes,
    alert_threshold_failures,
    alert_threshold_response_time_ms
) VALUES 
(
    'k1l2m3n4-o5p6-7890-klmn-123456789012',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'healthy',
    245,
    99.8,
    99.9,
    99.7,
    99.5,
    267,
    145,
    890,
    0.1,
    0.3,
    15,
    30,
    ARRAY[200, 201],
    3,
    5000
),
(
    'l2m3n4o5-p6q7-8901-lmno-234567890123',
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    'degraded',
    1234,
    97.2,
    96.8,
    97.5,
    98.1,
    1156,
    678,
    3456,
    2.8,
    2.5,
    15,
    30,
    ARRAY[200, 201, 202],
    3,
    5000
),
(
    'm3n4o5p6-q7r8-9012-mnop-345678901234',
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    'healthy',
    567,
    98.9,
    99.1,
    98.7,
    99.2,
    589,
    234,
    1234,
    1.1,
    1.3,
    15,
    30,
    ARRAY[200],
    5,
    8000
),
(
    'n4o5p6q7-r8s9-0123-nopq-456789012345',
    'd4e5f6g7-h8i9-0123-defg-456789012345',
    'healthy',
    189,
    99.9,
    100.0,
    99.8,
    99.6,
    201,
    156,
    345,
    0.0,
    0.2,
    30,
    45,
    ARRAY[200, 201],
    2,
    3000
),
(
    'o5p6q7r8-s9t0-1234-opqr-567890123456',
    'e5f6g7h8-i9j0-1234-efgh-567890123456',
    'healthy',
    334,
    99.1,
    99.3,
    98.9,
    99.4,
    356,
    201,
    789,
    0.7,
    1.1,
    15,
    30,
    ARRAY[200, 201, 204],
    3,
    5000
);

-- Insert sample sync state tracking
INSERT INTO api_sync_state (
    id,
    endpoint_id,
    sync_key,
    last_sync_timestamp,
    last_sync_cursor,
    total_records_synced,
    last_record_id,
    data_checksum,
    sync_frequency,
    average_records_per_sync,
    last_successful_sync,
    consecutive_sync_failures
) VALUES 
(
    'p6q7r8s9-t0u1-2345-pqrs-678901234567',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'property_registrations_incremental',
    '2024-01-15 02:15:33+00',
    'cursor_glc_20240115_021533',
    45892,
    'GLC-REG-20240115-3456',
    'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
    'daily',
    127,
    '2024-01-15 02:16:45+00',
    0
),
(
    'q7r8s9t0-u1v2-3456-qrst-789012345678',
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    'building_permits_incremental',
    '2024-01-15 02:45:12+00',
    'cursor_tcpd_20240115_024512',
    23456,
    'TCPD-BP-20240115-1789',
    'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
    'daily',
    89,
    '2024-01-15 02:46:34+00',
    0
),
(
    'r8s9t0u1-v2w3-4567-rstu-890123456789',
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    'property_transactions_full_sync',
    '2024-01-14 03:15:22+00',
    null,
    12345,
    'RGD-TXN-20240114-0987',
    'c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
    'weekly',
    2469,
    '2024-01-14 03:17:45+00',
    0
),
(
    's9t0u1v2-w3x4-5678-stuv-901234567890',
    'd4e5f6g7-h8i9-0123-defg-456789012345',
    'mortgage_statistics_full_sync',
    '2024-01-01 06:12:44+00',
    null,
    156,
    'BOG-MS-202312-001',
    'd4e5f6789012345678901234567890abcdef1234567890abcdef1234567890',
    'monthly',
    156,
    '2024-01-01 06:13:12+00',
    0
),
(
    't0u1v2w3-x4y5-6789-tuvw-012345678901',
    'e5f6g7h8-i9j0-1234-efgh-567890123456',
    'market_indicators_incremental',
    '2024-01-05 04:23:11+00',
    'cursor_gss_20240105_042311',
    789,
    'GSS-MI-20240105-0234',
    'e5f6789012345678901234567890abcdef1234567890abcdef12345678901',
    'monthly',
    789,
    '2024-01-05 04:24:33+00',
    0
);

-- Insert some sample successful job history
INSERT INTO api_pull_jobs (
    id,
    endpoint_id,
    job_type,
    sync_type,
    status,
    started_at,
    completed_at,
    duration_seconds,
    records_fetched,
    records_processed,
    records_failed,
    data_size_bytes,
    api_calls_made,
    api_errors,
    fallback_triggered,
    triggered_by
) VALUES 
-- Recent successful jobs
(
    'u1v2w3x4-y5z6-7890-uvwx-123456789012',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'api_pull',
    'incremental',
    'completed',
    '2024-01-15 02:00:00+00',
    '2024-01-15 02:16:45+00',
    1005,
    127,
    127,
    0,
    45678,
    3,
    0,
    false,
    'scheduler'
),
(
    'v2w3x4y5-z6a7-8901-vwxy-234567890123',
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    'api_pull',
    'incremental',
    'completed',
    '2024-01-15 02:30:00+00',
    '2024-01-15 02:46:34+00',
    994,
    89,
    89,
    0,
    32145,
    2,
    0,
    false,
    'scheduler'
),
(
    'w3x4y5z6-a7b8-9012-wxyz-345678901234',
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    'api_pull',
    'full_sync',
    'completed',
    '2024-01-14 03:00:00+00',
    '2024-01-14 03:17:45+00',
    1065,
    2469,
    2469,
    0,
    567890,
    25,
    0,
    false,
    'scheduler'
),
(
    'x4y5z6a7-b8c9-0123-xyza-456789012345',
    'd4e5f6g7-h8i9-0123-defg-456789012345',
    'api_pull',
    'full_sync',
    'completed',
    '2024-01-01 06:00:00+00',
    '2024-01-01 06:13:12+00',
    792,
    156,
    156,
    0,
    89123,
    1,
    0,
    false,
    'scheduler'
),
-- Some failed jobs for error analysis
(
    'y5z6a7b8-c9d0-1234-yzab-567890123456',
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    'api_pull',
    'incremental',
    'failed',
    '2024-01-12 02:30:00+00',
    '2024-01-12 02:35:15+00',
    315,
    0,
    0,
    0,
    0,
    1,
    1,
    true,
    'scheduler'
),
(
    'z6a7b8c9-d0e1-2345-zabc-678901234567',
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    'api_pull',
    'full_sync',
    'failed',
    '2024-01-10 03:00:00+00',
    '2024-01-10 03:05:22+00',
    322,
    0,
    0,
    0,
    0,
    1,
    1,
    false,
    'scheduler'
);

-- Insert some sample error records
INSERT INTO api_pull_errors (
    id,
    job_id,
    endpoint_id,
    error_type,
    error_code,
    http_status,
    error_message,
    error_context,
    occurred_at,
    first_occurrence,
    occurrence_count,
    is_resolved,
    affected_records,
    business_impact
) VALUES 
(
    '01a2b3c4-d5e6-7f89-0123-456789abcdef',
    'y5z6a7b8-c9d0-1234-yzab-567890123456',
    'b2c3d4e5-f6g7-8901-bcde-f23456789012',
    'server_error',
    'INTERNAL_SERVER_ERROR',
    500,
    'Internal server error occurred during data retrieval',
    '{
        "request_url": "https://api.tcpd.gov.gh/v2/permits?cursor=cursor_tcpd_20240112_023000&page_size=100",
        "response_headers": {
            "content-type": "application/json",
            "x-request-id": "req-tcpd-20240112-789123"
        },
        "response_body": "{\"error\": \"Database connection timeout\"}"
    }',
    '2024-01-12 02:33:15+00',
    '2024-01-12 02:33:15+00',
    1,
    true,
    0,
    'medium'
),
(
    '12b3c4d5-e6f7-8901-2345-6789abcdef01',
    'z6a7b8c9-d0e1-2345-zabc-678901234567',
    'c3d4e5f6-g7h8-9012-cdef-345678901234',
    'authentication',
    'TOKEN_EXPIRED',
    401,
    'OAuth2 access token has expired',
    '{
        "request_url": "https://api.rgd.gov.gh/v1/transactions?page=1&size=50",
        "response_headers": {
            "www-authenticate": "Bearer error=\"invalid_token\", error_description=\"The access token expired\""
        },
        "token_expiry": "2024-01-10T02:45:00Z",
        "token_issued": "2024-01-09T02:45:00Z"
    }',
    '2024-01-10 03:02:45+00',
    '2024-01-10 03:02:45+00',
    1,
    false,
    0,
    'high'
);

-- Update audit log
INSERT INTO data_audit_log (
    table_name, operation, description, performed_by, metadata
) VALUES (
    'api_pull_sample_data', 'INSERT', 
    'Inserted sample API pull integration data for Ghana property data sources: 5 endpoints, 5 schedules, 5 health checks, 5 sync states, 6 job records, 2 error records',
    'migration_sample_data',
    '{
        "endpoints": 5,
        "schedules": 5,
        "health_checks": 5,
        "sync_states": 5,
        "jobs": 6,
        "errors": 2,
        "data_sources": ["Ghana Lands Commission", "Town and Country Planning Dept", "Registrar General Dept", "Bank of Ghana", "Ghana Statistical Service"]
    }'
);