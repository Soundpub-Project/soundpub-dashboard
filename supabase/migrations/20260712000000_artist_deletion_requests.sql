CREATE TABLE IF NOT EXISTS public.artist_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.artist_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Label can view their own requests" 
    ON public.artist_deletion_requests FOR SELECT 
    USING (label_id = auth.uid());

CREATE POLICY "Label can insert their own requests" 
    ON public.artist_deletion_requests FOR INSERT 
    WITH CHECK (label_id = auth.uid());

CREATE POLICY "Admin can view all requests" 
    ON public.artist_deletion_requests FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'superadmin')
        )
    );

CREATE POLICY "Admin can update requests" 
    ON public.artist_deletion_requests FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'superadmin')
        )
    );

