-- One row per distinct conditioning-style section (by content hash).
select sec.role, coalesce(sec.format, 'unclassified') as format, min(sec.title) as title,
       sec.minutes_min, sec.minutes_max, sec.content_hash as hash,
       count(distinct sc.week_id) as weeks,
       group_concat(distinct e.name) as movements
from sections sec
join schedule sc on sc.session_id = sec.session_id
left join items i on i.section_id = sec.id
left join exercises e on e.id = i.exercise_id
where sec.role in ('conditioning', 'finisher', 'hot-start', 'speed-strength')
group by sec.role, sec.format, sec.minutes_min, sec.minutes_max, sec.content_hash
order by sec.role, format, sec.minutes_min
