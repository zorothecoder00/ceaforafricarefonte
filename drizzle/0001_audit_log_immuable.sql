-- Journal d'audit horodaté et non modifiable (CDC §12) : toute modification ou suppression est refusée.
CREATE OR REPLACE FUNCTION public.audit_log_immuable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul : % refusé', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.audit_log_immuable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_immuable();
