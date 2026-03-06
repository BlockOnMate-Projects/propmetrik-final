-- Migration 143: Add 'crypto' to payment_method_enum
-- Needed because crypto payments via NOWPayments must be recorded in rent_payments
-- alongside legacy MoMo/card payments.

ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'crypto';
