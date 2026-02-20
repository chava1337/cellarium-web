-- RLS: branches (20260207213838_remote_schema.sql ~3533)
create policy "Users can insert own branches" on "public"."branches" for insert to public
  with check ((auth.uid() = owner_id));

create policy "Users can update own branches" on "public"."branches" for update to public
  using ((auth.uid() = owner_id));

create policy "Users can view own branches" on "public"."branches" for select to public
  using (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1 FROM users
    WHERE ((users.id = auth.uid()) AND (users.branch_id = branches.id))))));

-- RLS: users (4063-4134)
create policy "Allow insert for authenticated users" on "public"."users" for insert to public
  with check ((auth.uid() = id));
create policy "Owners can update their staff" on "public"."users" for update to public
  using ((auth.uid() = owner_id)) with check ((auth.uid() = owner_id));
create policy "Owners can view their staff" on "public"."users" for select to public
  using (((auth.uid() = id) OR (auth.uid() = owner_id)));
create policy "Users can update own record" on "public"."users" for update to public
  using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "Users can view their own profile" on "public"."users" for select to authenticated
  using ((auth.uid() = id));

-- RLS: subscriptions (3905)
create policy "subscriptions_select_owner" on "public"."subscriptions" for select to public
  using (((auth.uid() = owner_id) OR (auth.uid() = user_id) OR (auth.uid() IN (
    SELECT users.id FROM users WHERE users.owner_id = subscriptions.owner_id))));
-- NOTA: subscriptions no tiene policy INSERT/UPDATE; solo Edge (service_role) escribe.
