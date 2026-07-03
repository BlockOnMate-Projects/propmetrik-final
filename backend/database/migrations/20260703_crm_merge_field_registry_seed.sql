-- Seed the CRM merge-field registry (system fields).
--
-- The registry (crm_merge_field_registry) powers the document-template field picker
-- and documents which {{merge.fields}} a template author can use. It was empty (0 rows)
-- despite crmDocumentTemplateService.getSystemMergeFields() reading from it — so the
-- picker showed nothing. These rows enumerate EXACTLY the dotted-path fields that
-- documentGenerationService.buildMergeContext() actually emits (deal / contact /
-- property / unit / project / organization), so every listed field resolves at render.
--
-- Idempotent: ON CONFLICT (field_key) DO NOTHING. is_system = TRUE, organization_id = NULL
-- (global). source_column values prefixed with a dot (e.g. custom_fields.ghana_card_number)
-- indicate a JSONB sub-path.

INSERT INTO crm_merge_field_registry
  (field_key, field_label, field_category, description, data_type, format_pattern, source_table, source_column, is_system, organization_id)
VALUES
  -- ── Deal ────────────────────────────────────────────────────────────────
  ('deal.title',               'Deal Title',             'deal', 'Title of the deal',                 'text',     NULL,          'deals',          'title',                 TRUE, NULL),
  ('deal.value',               'Deal Value',             'deal', 'Numeric deal value',                'number',   NULL,          'deals',          'deal_value',            TRUE, NULL),
  ('deal.value_formatted',     'Deal Value (formatted)', 'deal', 'Deal value with currency symbol',   'text',     NULL,          'deals',          'deal_value',            TRUE, NULL),
  ('deal.currency',            'Deal Currency',          'deal', 'ISO currency code',                 'text',     NULL,          'deals',          'currency',              TRUE, NULL),
  ('deal.expected_close_date', 'Expected Close Date',    'deal', 'Estimated close date',              'date',     'DD/MM/YYYY',  'deals',          'estimated_close_date',  TRUE, NULL),
  ('deal.pipeline_name',       'Pipeline',               'deal', 'Pipeline the deal is in',           'text',     NULL,          'deal_pipelines', 'pipeline_name',         TRUE, NULL),
  ('deal.stage_name',          'Stage',                  'deal', 'Current pipeline stage',            'text',     NULL,          'deal_stages',    'stage_name',            TRUE, NULL),

  -- ── Contact ─────────────────────────────────────────────────────────────
  ('contact.full_name',        'Full Name',              'contact', 'First + last name',              'text',  NULL, 'contacts', 'first_name,last_name',            TRUE, NULL),
  ('contact.first_name',       'First Name',             'contact', 'Given name',                     'text',  NULL, 'contacts', 'first_name',                      TRUE, NULL),
  ('contact.last_name',        'Last Name',              'contact', 'Family name',                    'text',  NULL, 'contacts', 'last_name',                       TRUE, NULL),
  ('contact.email',            'Email',                  'contact', 'Primary email',                  'text',  NULL, 'contacts', 'email',                           TRUE, NULL),
  ('contact.phone',            'Phone',                  'contact', 'Primary phone',                  'text',  NULL, 'contacts', 'primary_phone',                   TRUE, NULL),
  ('contact.address',          'Address',                'contact', 'Current address',                'text',  NULL, 'contacts', 'current_address',                 TRUE, NULL),
  ('contact.city',             'City',                   'contact', 'City',                           'text',  NULL, 'contacts', 'city',                            TRUE, NULL),
  ('contact.country',          'Country',                'contact', 'Country of residence',           'text',  NULL, 'contacts', 'country_of_residence',            TRUE, NULL),
  ('contact.ghana_card_number','Ghana Card Number',      'contact', 'Ghana Card ID (from custom fields)','text',NULL, 'contacts', 'custom_fields.ghana_card_number', TRUE, NULL),
  ('contact.tin_number',       'TIN Number',             'contact', 'Tax ID (from custom fields)',    'text',  NULL, 'contacts', 'custom_fields.tin_number',        TRUE, NULL),
  ('contact.passport_number',  'Passport Number',        'contact', 'Passport (from custom fields)',  'text',  NULL, 'contacts', 'custom_fields.passport_number',   TRUE, NULL),
  ('contact.occupation',       'Occupation',             'contact', 'Occupation',                     'text',  NULL, 'contacts', 'occupation',                      TRUE, NULL),
  ('contact.employer',         'Employer',               'contact', 'Employer',                       'text',  NULL, 'contacts', 'employer',                        TRUE, NULL),

  -- ── Property ────────────────────────────────────────────────────────────
  ('property.name',            'Property Name',          'property', 'Property title/name',           'text',   NULL, 'properties', 'title',                        TRUE, NULL),
  ('property.address',         'Property Address',       'property', 'Street address',                'text',   NULL, 'properties', 'address_street',               TRUE, NULL),
  ('property.city',            'Property City',          'property', 'City',                          'text',   NULL, 'properties', 'address_city',                 TRUE, NULL),
  ('property.region',          'Region',                 'property', 'Region',                        'text',   NULL, 'properties', 'region',                       TRUE, NULL),
  ('property.ghana_post_gps',  'Ghana Post GPS',         'property', 'Digital address',               'text',   NULL, 'properties', 'digital_address',              TRUE, NULL),
  ('property.land_title',      'Land Title',             'property', 'Land title number (metadata)',  'text',   NULL, 'properties', 'metadata.land_title_number',   TRUE, NULL),
  ('property.plot_number',     'Plot Number',            'property', 'Plot number (metadata)',        'text',   NULL, 'properties', 'metadata.plot_number',         TRUE, NULL),
  ('property.block_number',    'Block Number',           'property', 'Block number (metadata)',       'text',   NULL, 'properties', 'metadata.block_number',        TRUE, NULL),
  ('property.land_size',       'Land Size',              'property', 'Land size',                     'text',   NULL, 'properties', 'land_area_sqm',                TRUE, NULL),
  ('property.land_size_unit',  'Land Size Unit',         'property', 'Unit for land size',            'text',   NULL, 'properties', NULL,                           TRUE, NULL),
  ('property.property_type',   'Property Type',          'property', 'Property type',                 'text',   NULL, 'properties', 'property_type',                TRUE, NULL),
  ('property.price',           'Price',                  'property', 'Numeric price',                 'number', NULL, 'properties', 'price',                        TRUE, NULL),
  ('property.price_formatted', 'Price (formatted)',      'property', 'Price with currency symbol',    'text',   NULL, 'properties', 'price',                        TRUE, NULL),
  ('property.bedrooms',        'Bedrooms',               'property', 'Bedroom count',                 'number', NULL, 'properties', 'bedrooms',                     TRUE, NULL),
  ('property.bathrooms',       'Bathrooms',              'property', 'Bathroom count',                'number', NULL, 'properties', 'bathrooms',                    TRUE, NULL),
  ('property.description',     'Description',            'property', 'Property description',          'text',   NULL, 'properties', 'description',                  TRUE, NULL),

  -- ── Unit ────────────────────────────────────────────────────────────────
  ('unit.number',              'Unit Number',            'unit', 'Unit number',                       'text',   NULL, 'project_units', 'unit_number',               TRUE, NULL),
  ('unit.type',                'Unit Type',              'unit', 'Unit type',                         'text',   NULL, 'project_units', 'unit_type',                 TRUE, NULL),
  ('unit.floor',               'Floor',                  'unit', 'Floor',                             'text',   NULL, 'project_units', 'floor',                     TRUE, NULL),
  ('unit.bedrooms',            'Unit Bedrooms',          'unit', 'Bedroom count',                     'number', NULL, 'project_units', 'bedrooms',                  TRUE, NULL),
  ('unit.bathrooms',           'Unit Bathrooms',         'unit', 'Bathroom count',                    'number', NULL, 'project_units', 'bathrooms',                 TRUE, NULL),
  ('unit.size',                'Unit Size',              'unit', 'Unit size',                         'text',   NULL, 'project_units', 'size',                      TRUE, NULL),
  ('unit.price',               'Unit Price',             'unit', 'Numeric unit price',                'number', NULL, 'project_units', 'price',                     TRUE, NULL),
  ('unit.price_formatted',     'Unit Price (formatted)', 'unit', 'Unit price with currency symbol',   'text',   NULL, 'project_units', 'price',                     TRUE, NULL),
  ('unit.project_name',        'Project Name',           'unit', 'Parent project name',               'text',   NULL, 'projects',      'name',                      TRUE, NULL),

  -- ── Project ─────────────────────────────────────────────────────────────
  ('project.name',             'Project Name',           'project', 'Project name',                   'text',   NULL, 'projects', 'name',              TRUE, NULL),
  ('project.location',         'Project Location',       'project', 'Project location',               'text',   NULL, 'projects', 'location',          TRUE, NULL),
  ('project.description',      'Project Description',     'project', 'Project description',            'text',   NULL, 'projects', 'description',       TRUE, NULL),
  ('project.developer',        'Developer',              'project', 'Developer name',                 'text',   NULL, 'projects', 'developer',         TRUE, NULL),
  ('project.total_units',      'Total Units',            'project', 'Total units',                    'number', NULL, 'projects', 'total_units',       TRUE, NULL),
  ('project.available_units',  'Available Units',        'project', 'Available units',                'number', NULL, 'projects', 'available_units',   TRUE, NULL),

  -- ── Organization ────────────────────────────────────────────────────────
  ('organization.name',        'Organization Name',      'organization', 'Organization name',         'text', NULL, 'organizations', 'name',      TRUE, NULL),
  ('organization.address',     'Organization Address',   'organization', 'Composed org address',      'text', NULL, 'organizations', 'address',   TRUE, NULL),
  ('organization.phone',       'Organization Phone',     'organization', 'Org phone',                 'text', NULL, 'organizations', 'phone',     TRUE, NULL),
  ('organization.email',       'Organization Email',     'organization', 'Org email',                 'text', NULL, 'organizations', 'email',     TRUE, NULL),
  ('organization.website',     'Website',                'organization', 'Org website',               'text', NULL, 'organizations', 'website',   TRUE, NULL),
  ('organization.logo_url',    'Logo URL',               'organization', 'Org logo URL',              'text', NULL, 'organizations', 'logo_url',  TRUE, NULL)
ON CONFLICT (field_key) DO NOTHING;
