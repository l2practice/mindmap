/* Starter templates. Compact syntax: [text, ...children] */
(function (g) {
'use strict';
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const build = a => { const n = { id: uid(), text: a[0], children: a.slice(1).map(build) }; return n; };

const T = [
  { key: 'blank', name: 'Blank map', icon: '＋', cat: 'all', layout: 'map', tree: ['Central topic'] },
  { key: 'lesson', name: 'Lesson plan', icon: '🎓', cat: 'edu', layout: 'right', tree: ['Lesson: [Title]',
      ['Objectives (CLO)', ['Knowledge'], ['Skills'], ['Attitude']],
      ['Warm-up', ['Lead-in questions'], ['Quick group activity']],
      ['Main content', ['Point 1'], ['Point 2'], ['Point 3']],
      ['Practice', ['Individual'], ['Pairs / groups']],
      ['Assessment', ['Format'], ['Criteria']],
      ['Homework']] },
  { key: 'syllabus', name: 'Course syllabus (CLO/PLO)', icon: '📘', cat: 'edu', layout: 'right', tree: ['Course: [Course title]',
      ['General information', ['Credits'], ['Target students'], ['Prerequisites']],
      ['Course learning outcomes (CLO)', ['CLO1'], ['CLO2'], ['CLO3']],
      ['Programme outcomes (PLO)', ['PLO1'], ['PLO2']],
      ['Weekly content', ['Weeks 1-4'], ['Weeks 5-8'], ['Weeks 9-12'], ['Weeks 13-15']],
      ['Teaching methods'], ['Assessment', ['Attendance'], ['Midterm'], ['Final exam']], ['Materials']] },
  { key: 'study', name: 'Study plan', icon: '📚', cat: 'edu', layout: 'map', tree: ['Study plan',
      ['Goals', ['Short term'], ['Long term']], ['Subjects', ['Subject 1'], ['Subject 2'], ['Subject 3']],
      ['Schedule', ['Morning'], ['Afternoon'], ['Evening']], ['Revision', ['Vocabulary'], ['Sample tests']], ['Track progress']] },
  { key: 'skills', name: 'Four language skills', icon: '🗣️', cat: 'edu', layout: 'map', tree: ['English',
      ['Listening', ['Listening for gist'], ['Listening for detail']], ['Speaking', ['Pronunciation'], ['Fluency']],
      ['Reading', ['Skimming'], ['Scanning']], ['Writing', ['Text structure'], ['Grammar, vocabulary']]] },
  { key: 'project', name: 'Project plan', icon: '💼', cat: 'work', layout: 'right', tree: ['Project: [Name]',
      ['Goals'], ['Scope'], ['Phases', ['Kick-off'], ['Execution'], ['Acceptance']],
      ['Resources', ['People'], ['Budget']], ['Risks'], ['Milestones']] },
  { key: 'meeting', name: 'Meeting notes', icon: '👥', cat: 'work', layout: 'right', tree: ['Meeting: [Topic]',
      ['Details', ['Date and time'], ['Attendees']], ['Discussion', ['Issue 1'], ['Issue 2']],
      ['Decisions'], ['Action items', ['Who - what - when']]] },
  { key: 'strategy', name: 'Business strategy', icon: '📈', cat: 'work', layout: 'map', tree: ['Strategy',
      ['SWOT analysis', ['Strengths'], ['Weaknesses'], ['Opportunities'], ['Threats']],
      ['Target market'], ['Products / services'], ['Channels'], ['Metrics (KPIs)']] },
  { key: 'brainstorm', name: 'Brainstorm', icon: '💡', cat: 'creative', layout: 'map', tree: ['Topic',
      ['Idea 1'], ['Idea 2'], ['Idea 3'], ['Open questions']] },
  { key: 'travel', name: 'Travel plan', icon: '✈️', cat: 'life', layout: 'map', tree: ['Trip',
      ['Destination'], ['Itinerary', ['Day 1'], ['Day 2'], ['Day 3']], ['Costs', ['Tickets'], ['Accommodation'], ['Food']],
      ['Packing list'], ['Documents']] },
  { key: 'growth', name: 'Personal growth', icon: '🌱', cat: 'life', layout: 'map', tree: ['Personal growth',
      ['Health'], ['Learning'], ['Finance'], ['Relationships'], ['Daily habits']] },
  { key: 'event', name: 'Event planning', icon: '📅', cat: 'life', layout: 'right', tree: ['Event: [Name]',
      ['Time & place'], ['Programme'], ['Assignments'], ['Budget'], ['Promotion'], ['Logistics']] },
  { key: 'story', name: 'Essay outline', icon: '✍️', cat: 'creative', layout: 'right', tree: ['Essay',
      ['Introduction', ['Hook'], ['Thesis']], ['Body', ['Argument 1'], ['Argument 2'], ['Argument 3']], ['Conclusion']] }
];
const CATS = [['all', 'All'], ['edu', 'Education'], ['work', 'Work'], ['life', 'Life'], ['creative', 'Creative']];

function make(key) {
  const t = T.find(x => x.key === key) || T[0], root = build(t.tree);
  return { v: 1, id: uid(), title: t.key === 'blank' ? 'New map' : t.name, layout: t.layout, theme: 'classic', lineStyle: 'curve', root };
}
g.MMTemplates = { list: T, cats: CATS, make };
})(window);
