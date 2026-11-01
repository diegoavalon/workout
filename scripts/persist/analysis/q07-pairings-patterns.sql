-- Pattern of the first two movements of each strength-balance superset (unique sessions).
select coalesce(e1.pattern, 'unresolved') as pattern_1,
       coalesce(e2.pattern, 'unresolved') as pattern_2,
       count(*) as supersets
from sections sec
join items i1 on i1.section_id = sec.id and i1.position = 1
join items i2 on i2.section_id = sec.id and i2.position = 2
left join exercises e1 on e1.id = i1.exercise_id
left join exercises e2 on e2.id = i2.exercise_id
where sec.role = 'strength-balance'
group by 1, 2
order by supersets desc
