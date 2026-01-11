import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export function GA4Provider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [ga4Enabled, setGa4Enabled] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const checkGA4Status = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'ga4_enabled')
          .single();

        if (!error && data?.value === 'true') {
          setGa4Enabled(true);
        }
      } catch (error) {
        console.error('Error checking GA4 status:', error);
      }
    };

    checkGA4Status();
  }, []);

  // Initialize GA4 script
  useEffect(() => {
    if (!ga4Enabled || initialized) return;

    // GA4 Measurement ID is stored as a secret, we'll use a placeholder
    // In production, this would come from an edge function
    const initGA4 = async () => {
      try {
        // Fetch GA4 config from edge function
        const { data, error } = await supabase.functions.invoke('get-ga4-config');
        
        if (error || !data?.measurementId) {
          console.log('GA4 not configured');
          return;
        }

        const measurementId = data.measurementId;

        // Load gtag script
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        document.head.appendChild(script);

        // Initialize dataLayer and gtag
        window.dataLayer = window.dataLayer || [];
        window.gtag = function() {
          window.dataLayer.push(arguments);
        };
        window.gtag('js', new Date());
        window.gtag('config', measurementId, {
          page_path: location.pathname,
        });

        setInitialized(true);
        console.log('GA4 initialized with ID:', measurementId);
      } catch (error) {
        console.error('Error initializing GA4:', error);
      }
    };

    initGA4();
  }, [ga4Enabled, initialized]);

  // Track page views
  useEffect(() => {
    if (initialized && window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: location.pathname,
        page_title: document.title,
      });
    }
  }, [location, initialized]);

  return <>{children}</>;
}

// Utility function to track custom events
export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (window.gtag) {
    window.gtag('event', eventName, parameters);
  }
};