-- Journal d'audit (CDC §12, §15.1) : toujours en ajout seul — toute modification est refusée — sauf la suppression des
-- entrées de plus de 5 ans, durée de conservation annoncée dans la politique de confidentialité (purge quotidienne).
CREATE OR REPLACE FUNCTION public.audit_log_immuable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.at < now() - interval '5 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log est en ajout seul : % refusé', TG_OP;
END;
$$;
