-- Supabase SQL Editor에서 직접 실행하세요. 새 프로젝트용 초기 설정입니다.
-- 기존 wx_tasks가 있으면 중단합니다. 삭제하거나 덮어쓰지 않습니다.
begin;

create table public.wx_tasks (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  region text not null check (region in ('세종', '대전', '태안', '보령')),
  kind text not null check (kind in ('야외', '고소', '실내')),
  owner text not null check (length(btrim(owner)) > 0)
);

alter table public.wx_tasks enable row level security;
revoke all on table public.wx_tasks from public, anon, authenticated;
grant usage on schema public to anon;
grant select on table public.wx_tasks to anon;
grant insert (title, region, kind, owner) on public.wx_tasks to anon;
grant usage on sequence public.wx_tasks_id_seq to anon;

create policy "Public task read" on public.wx_tasks
  for select to anon using (true);
create policy "Public task insert" on public.wx_tasks
  for insert to anon with check (true);

insert into public.wx_tasks (title, region, kind, owner) values
  ('다중이용시설 안전점검', '세종', '야외', '김안전'),
  ('시민 안전체험 행사 운영', '보령', '야외', '이행사'),
  ('옥상 태양광 설비 점검', '태안', '고소', '박설비'),
  ('하천 수위계 확인', '대전', '야외', '최현장'),
  ('청사 외벽 간판 보수', '세종', '고소', '정시설'),
  ('비상연락 훈련', '대전', '실내', '한상황');

commit;
