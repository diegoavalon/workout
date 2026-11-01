-- Movements used in conditioning-style sections with their equipment.
select sec.role, coalesce(sec.format, 'unclassified') as format, e.name as movement,
       coalesce(e.pattern, 'unresolved') as pattern, e.equipment as equipment, count(distinct sec.content_hash) as sections
from sections sec
join items i on i.section_id = sec.id
left join exercises e on e.id = i.exercise_id
where sec.role in ('conditioning', 'finisher', 'hot-start', 'speed-strength') and e.name is not null
group by 1, 2, 3, 4, 5
order by sections desc
