-- Sections (by content hash) that appear in more than one week, with where and when.
select sec.role,
       sec.content_hash as hash,
       min(sec.title) as title,
       count(distinct sc.week_id) as weeks,
       count(distinct w.block_id) as blocks,
       count(*) as track_days,
       min(sc.date) as first_date,
       max(sc.date) as last_date,
       group_concat(distinct sc.track_id) as tracks
from schedule sc
join weeks w on w.id = sc.week_id
join sections sec on sec.session_id = sc.session_id
where sec.role not in ('focus-note')
group by sec.role, sec.content_hash
having count(distinct sc.week_id) > 1
order by weeks desc, blocks desc, sec.role
