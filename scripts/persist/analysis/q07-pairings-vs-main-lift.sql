-- What the strength-balance superset trains relative to the main lift of the same session.
select coalesce(m.pattern, 'unresolved') as main_lift_pattern,
       coalesce(e1.pattern, 'unresolved') as balance_1,
       coalesce(e2.pattern, 'unresolved') as balance_2,
       count(*) as sessions
from sections sec
join sections main on main.session_id = sec.session_id and main.role = 'strength-intensity-1'
join items mi on mi.section_id = main.id
left join exercises m on m.id = mi.exercise_id
join items i1 on i1.section_id = sec.id and i1.position = 1
join items i2 on i2.section_id = sec.id and i2.position = 2
left join exercises e1 on e1.id = i1.exercise_id
left join exercises e2 on e2.id = i2.exercise_id
where sec.role = 'strength-balance'
group by 1, 2, 3
order by sessions desc
