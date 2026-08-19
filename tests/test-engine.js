const Engine=require('../engine-core.js');
const rules={
  cardModel:{rankOrder:['2','3','4','5','6','7','8','9','10','J','Q','K','A'],rankPoints:{'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:10,Q:10,K:10,A:11}},
  meld:{setMin:3,setMax:4,runMin:3,jokerWild:true}
};
const active={aceLow:true,aceHigh:true};
let n=0;
const card=(rank,suit,uid=`x${++n}`)=>({rank,suit,uid,joker:false});
const joker=(uid=`j${++n}`)=>({rank:'JOKER',suit:null,uid,joker:true});
function expect(name,cond,detail=''){if(!cond){console.error('FAIL',name,detail);process.exitCode=1}else console.log('PASS',name,detail)}
function a(cards){return Engine.analyzeGroup(rules,active,cards)}
let x;
x=a([card('A','D'),card('2','D'),card('3','D')]); expect('A-2-3 legal',x.valid&&x.type==='run',JSON.stringify(x)); expect('A-2-3 score 6',x.score===6,`score=${x.score}`);
x=a([card('Q','S'),card('K','S'),card('A','S')]); expect('Q-K-A legal',x.valid&&x.type==='run',JSON.stringify(x)); expect('Q-K-A score 31',x.score===31,`score=${x.score}`);
x=a([card('K','H'),card('A','H'),card('2','H')]); expect('K-A-2 illegal',!x.valid,JSON.stringify(x));
x=a([card('A','H'),card('A','D'),card('A','S')]); expect('3 aces different suits legal',x.valid&&x.type==='set',JSON.stringify(x)); expect('3 aces score 33',x.score===33,`score=${x.score}`);
x=a([card('3','H'),card('3','H'),card('3','S')]); expect('duplicate suit in set illegal',!x.valid,JSON.stringify(x));
const group1=a([card('A','H'),card('A','D'),card('A','S')]);
const group2=a([card('A','H'),card('A','D'),card('A','C')]); expect('two separate ace groups each legal',group1.valid&&group2.valid);
const finalRun=a([card('4','D'),card('5','D'),card('6','D')]); const finalSet=a([card('3','D'),card('3','S'),card('3','C')]); expect('rebuild 345 -> 456 + threes',finalRun.valid&&finalSet.valid,`${finalRun.label} / ${finalSet.label}`);
const j=joker(); x=a([j,card('6','S'),card('7','S')]); expect('Joker-6-7 legal',x.valid&&x.type==='run',JSON.stringify(x));
const freed=a([card('6','S'),card('7','S'),card('8','S')]); const reused=a([j,card('9','H'),card('10','H')]); expect('joker can be freed by 8 and reused',freed.valid&&reused.valid,`${freed.label} / ${reused.label}`);
x=a([card('J','C'),card('Q','C'),card('K','C')]); expect('J-Q-K entry equals 30',x.valid&&x.score===30,`score=${x.score}`);
const hand=[card('A','H'),card('A','D'),card('A','S'),card('4','C'),card('8','D'),card('9','S'),card('2','H')];
const entry=Engine.findBestEntryMelds(rules,active,hand,30); expect('AI finds 3 aces as entry >=30',entry&&entry.score>=30,JSON.stringify(entry&&{score:entry.score,count:entry.count}));

// 0.3.2: bot/solver może korzystać z kart już leżących na stole.
const table345={id:'table345',cards:[card('3','D'),card('4','D'),card('5','D')]};
const handForRebuild=[card('3','S'),card('3','C'),card('6','D'),card('9','H')];
const rearranged=Engine.findBestTableRearrangement(rules,active,[table345],handForRebuild,{maxNodes:100000,maxCandidates:12000});
expect('AI rearranges table 345 into 456 + three 3s',rearranged&&rearranged.handCount>=3,JSON.stringify(rearranged&&{handCount:rearranged.handCount,groups:rearranged.groups.map(g=>g.analysis.label)}));
if(rearranged){
  const labels=rearranged.groups.map(g=>g.analysis.label);
  expect('AI rebuild contains D 4-5-6',labels.some(x=>x==='D 4-5-6'),JSON.stringify(labels));
  expect('AI rebuild contains 3 x 3',rearranged.groups.some(g=>g.analysis.type==='set'&&g.cards.length===3&&g.cards.every(c=>c.joker||c.rank==='3')),JSON.stringify(labels));
}

const tableJ67={id:'tableJ67',cards:[joker(),card('6','S'),card('7','S')]};
const handJokerReuse=[card('8','S'),card('9','H'),card('10','H')];
const jokerRearranged=Engine.findBestTableRearrangement(rules,active,[tableJ67],handJokerReuse,{maxNodes:100000,maxCandidates:12000});
expect('AI can free table joker and reuse it',jokerRearranged&&jokerRearranged.handCount>=3,JSON.stringify(jokerRearranged&&{handCount:jokerRearranged.handCount,groups:jokerRearranged.groups.map(g=>g.analysis.label)}));

// 0.3.3: licznik „ile jeszcze wyłożysz” korzysta z pakowania meldów.
const packHand=[
  card('3','D'),card('3','S'),card('3','C'),
  card('4','H'),card('5','H'),card('6','H'),
  card('9','C')
];
const packed=Engine.findBestMeldPacking(rules,active,packHand,{maxNodes:50000,maxCandidates:8000});
expect('tooltip packing finds 6 playable hand cards',packed&&packed.cardCount===6,JSON.stringify(packed&&{cardCount:packed.cardCount,groups:packed.groups.map(g=>g.analysis.label)}));

const duplicatePack=[
  card('A','H'),card('A','D'),card('A','S'),
  card('A','H'),card('A','D'),card('A','C')
];
const packedDuplicate=Engine.findBestMeldPacking(rules,active,duplicatePack,{maxNodes:50000,maxCandidates:8000});
expect('tooltip packing handles duplicate decks / two ace groups',packedDuplicate&&packedDuplicate.cardCount===6,JSON.stringify(packedDuplicate&&{cardCount:packedDuplicate.cardCount,groups:packedDuplicate.groups.map(g=>g.analysis.label)}));
