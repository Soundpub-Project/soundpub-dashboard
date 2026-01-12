-- =====================================================
-- CRITICAL SECURITY FIX: Payout Requests RLS & Trigger
-- =====================================================

-- Step 1: Drop the dangerous RLS policy that allows users to self-approve payouts
DROP POLICY IF EXISTS "Users can manage their own payouts" ON public.payout_requests;

-- Step 2: Create granular RLS policies for payout_requests

-- Users can only INSERT pending payouts with positive amounts
CREATE POLICY "Users can create pending payouts"
ON public.payout_requests FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND status = 'pending'
  AND amount > 0
);

-- Users can only SELECT their own payouts (read-only)
CREATE POLICY "Users can view their own payouts"
ON public.payout_requests FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can DELETE only their own pending payouts (cancel before approval)
CREATE POLICY "Users can cancel pending payouts"
ON public.payout_requests FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() 
  AND status = 'pending'
);

-- Step 3: Add database constraints to prevent invalid data

-- Add CHECK constraint to prevent negative balances
ALTER TABLE public.profiles
ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);

-- Add amount validation constraints
ALTER TABLE public.payout_requests
ADD CONSTRAINT amount_positive CHECK (amount > 0);

-- Step 4: Replace the SECURITY DEFINER trigger function with proper validation
CREATE OR REPLACE FUNCTION public.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $$
DECLARE
  current_balance DECIMAL(18,2);
  caller_is_admin BOOLEAN;
BEGIN
    -- Check if the caller is an admin
    caller_is_admin := public.is_admin(auth.uid());
    
    -- Handle transition TO 'paid' status
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        -- CRITICAL: Only admins can mark payouts as paid
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can mark payouts as paid';
        END IF;
        
        -- Validate amount is positive
        IF NEW.amount <= 0 THEN
            RAISE EXCEPTION 'Payout amount must be positive';
        END IF;
        
        -- Check current balance with row-level locking to prevent race conditions
        SELECT balance INTO current_balance
        FROM public.profiles
        WHERE id = NEW.user_id
        FOR UPDATE;
        
        -- Validate sufficient balance
        IF current_balance IS NULL THEN
            RAISE EXCEPTION 'User profile not found';
        END IF;
        
        IF current_balance < NEW.amount THEN
            RAISE EXCEPTION 'Insufficient balance: user has %, requested %', 
              current_balance, NEW.amount;
        END IF;
        
        -- Update balance atomically
        UPDATE public.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id AND balance >= NEW.amount;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Failed to update balance - concurrent modification or insufficient funds';
        END IF;
        
        -- Set processed_by and processed_at
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
        
    -- Handle payout reversions (FROM 'paid' to another status)
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        -- Only admins can revert paid payouts
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can revert paid payouts';
        END IF;
        
        -- Refund the balance
        UPDATE public.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
        
    -- Handle approval/rejection (status changes to 'approved' or 'rejected')
    ELSIF NEW.status IN ('approved', 'rejected') AND 
          (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        -- Only admins can approve/reject
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can approve or reject payouts';
        END IF;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
    END IF;

    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;