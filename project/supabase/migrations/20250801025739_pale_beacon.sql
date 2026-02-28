/*
  # Create unlearning_requests table

  1. New Tables
    - `unlearning_requests`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `model_id` (text)
      - `request_reason` (text, not null)
      - `data_count` (integer)
      - `status` (text, not null)
      - `processing_time_seconds` (integer)
      - `blockchain_tx_hash` (text)
      - `audit_trail` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `unlearning_requests` table
    - Add policy for authenticated users to view their own requests
    - Add policy for authenticated users to insert their own requests

  3. Triggers
    - Auto-update updated_at column on changes
*/

CREATE TABLE IF NOT EXISTS public.unlearning_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model_id text,
    request_reason text NOT NULL,
    data_count integer DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    processing_time_seconds integer,
    blockchain_tx_hash text,
    audit_trail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.unlearning_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own unlearning requests"
ON public.unlearning_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own unlearning requests"
ON public.unlearning_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own unlearning requests"
ON public.unlearning_requests FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add trigger for updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'update_unlearning_requests_updated_at'
  ) THEN
    CREATE TRIGGER update_unlearning_requests_updated_at
    BEFORE UPDATE ON public.unlearning_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;