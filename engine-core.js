(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.CardSandboxEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SUIT_ORDER=['S','H','D','C'];

  function rankPoint(rules,rank,aceAsLow=false){
    return rank==='A'&&aceAsLow?1:(rules.cardModel.rankPoints[rank]??0);
  }

  function invalid(reason){return{valid:false,type:null,score:0,reason,orderedCards:[],jokerAssignments:{}};}

  function highestPointRank(rules){
    return [...rules.cardModel.rankOrder].sort((a,b)=>rankPoint(rules,b,false)-rankPoint(rules,a,false))[0];
  }

  function analyzeSet(rules,cards){
    if(cards.length<rules.meld.setMin||cards.length>rules.meld.setMax) return invalid(`Grupa musi mieć ${rules.meld.setMin}–${rules.meld.setMax} karty`);
    const jokers=cards.filter(c=>c.joker), naturals=cards.filter(c=>!c.joker);
    if(jokers.length&&!rules.meld.jokerWild) return invalid('Joker nie jest dziki');
    const ranks=new Set(naturals.map(c=>c.rank));
    if(ranks.size>1) return invalid('Grupa wymaga tej samej wartości');
    const suits=naturals.map(c=>c.suit);
    if(new Set(suits).size!==suits.length) return invalid('W grupie nie mogą powtarzać się kolory');
    if(naturals.length+jokers.length>4) return invalid('Są tylko cztery różne kolory');
    const rank=naturals[0]?.rank??highestPointRank(rules);
    const missingSuits=SUIT_ORDER.filter(s=>!suits.includes(s));
    if(jokers.length>missingSuits.length) return invalid('Za dużo jokerów jak na różne kolory');
    const jokerAssignments={};
    jokers.forEach((j,i)=>jokerAssignments[j.uid]={rank,suit:missingSuits[i],aceLow:false});
    const ordered=[...naturals].sort((a,b)=>SUIT_ORDER.indexOf(a.suit)-SUIT_ORDER.indexOf(b.suit));
    ordered.push(...jokers);
    return{valid:true,type:'set',score:cards.length*rankPoint(rules,rank,false),reason:'',orderedCards:ordered,jokerAssignments,label:`${cards.length} × ${rank}`};
  }

  function analyzeRun(rules,active,cards){
    if(cards.length<rules.meld.runMin) return invalid(`Sekwens wymaga minimum ${rules.meld.runMin} kart`);
    if(cards.length>rules.cardModel.rankOrder.length) return invalid('Sekwens nie może być dłuższy niż liczba rang');
    const jokers=cards.filter(c=>c.joker), naturals=cards.filter(c=>!c.joker);
    if(jokers.length&&!rules.meld.jokerWild) return invalid('Joker nie jest dziki');
    const suits=new Set(naturals.map(c=>c.suit));
    if(suits.size>1) return invalid('Sekwens musi być w jednym kolorze');
    const counts=new Map();
    for(const c of naturals) counts.set(c.rank,(counts.get(c.rank)||0)+1);
    if([...counts.values()].some(v=>v>1)) return invalid('W sekwensie nie można powtórzyć tej samej rangi');

    const variants=[];
    const base=rules.cardModel.rankOrder;
    if(active.aceHigh) variants.push({mode:'high',order:[...base]});
    if(active.aceLow) variants.push({mode:'low',order:['A',...base.filter(r=>r!=='A')]});
    const naturalRanks=new Set(naturals.map(c=>c.rank));
    const analyses=[];
    for(const variant of variants){
      const order=variant.order;
      for(let start=0;start<=order.length-cards.length;start++){
        const segment=order.slice(start,start+cards.length);
        if(![...naturalRanks].every(r=>segment.includes(r))) continue;
        const missing=segment.filter(r=>!naturalRanks.has(r));
        if(missing.length!==jokers.length) continue;
        const suit=naturals[0]?.suit??'S';
        const jokerAssignments={};
        jokers.forEach((j,i)=>jokerAssignments[j.uid]={rank:missing[i],suit,aceLow:variant.mode==='low'&&missing[i]==='A'});
        const score=segment.reduce((sum,r)=>sum+rankPoint(rules,r,variant.mode==='low'&&r==='A'),0);
        const byRank=new Map(naturals.map(c=>[c.rank,c]));
        const orderedCards=segment.map(r=>byRank.get(r)||jokers[missing.indexOf(r)]).filter(Boolean);
        analyses.push({valid:true,type:'run',score,reason:'',orderedCards,jokerAssignments,label:`${suit} ${segment.join('-')}`,segment,mode:variant.mode});
      }
    }
    if(!analyses.length) return invalid('Karty nie tworzą ciągłego sekwensu (bez zawijania K-A-2)');
    analyses.sort((a,b)=>b.score-a.score);
    return analyses[0];
  }

  function analyzeGroup(rules,active,cards){
    if(!cards.length) return invalid('Pusty układ');
    const set=analyzeSet(rules,cards);
    const run=analyzeRun(rules,active,cards);
    if(set.valid&&run.valid) return set.score>=run.score?set:run;
    if(set.valid) return set;
    if(run.valid) return run;
    const min=Math.min(rules.meld.setMin,rules.meld.runMin);
    const reason=cards.length<min?`Za mało kart — minimum ${min}.`:`${set.reason}; ${run.reason}`;
    return invalid(reason);
  }

  function combinations(arr,k){
    const out=[];
    function rec(start,pick){
      if(pick.length===k){out.push([...pick]);return;}
      for(let i=start;i<=arr.length-(k-pick.length);i++){pick.push(arr[i]);rec(i+1,pick);pick.pop();}
    }
    rec(0,[]);return out;
  }

  function enumerateCandidateMelds(rules,active,hand){
    const candidates=[],seen=new Set();
    const add=cards=>{
      const key=cards.map(c=>c.uid).sort().join('|'); if(seen.has(key))return;
      const analysis=analyzeGroup(rules,active,cards); if(!analysis.valid)return;
      seen.add(key); candidates.push({cards:[...cards],analysis,key});
    };
    const jokers=hand.filter(c=>c.joker);
    for(const rank of rules.cardModel.rankOrder){
      const bySuit=new Map();
      for(const c of hand.filter(c=>!c.joker&&c.rank===rank)) if(!bySuit.has(c.suit)) bySuit.set(c.suit,c);
      const naturals=[...bySuit.values()];
      for(let size=rules.meld.setMin;size<=rules.meld.setMax;size++){
        for(let j=0;j<=Math.min(jokers.length,size);j++){
          const need=size-j; if(need<0||need>naturals.length)continue;
          for(const combo of combinations(naturals,need)) add([...combo,...jokers.slice(0,j)]);
        }
      }
    }
    const variants=[];
    if(active.aceHigh) variants.push([...rules.cardModel.rankOrder]);
    if(active.aceLow) variants.push(['A',...rules.cardModel.rankOrder.filter(r=>r!=='A')]);
    for(const suit of SUIT_ORDER){
      const rankToCards=new Map();
      for(const c of hand.filter(c=>!c.joker&&c.suit===suit)){
        if(!rankToCards.has(c.rank))rankToCards.set(c.rank,[]);
        rankToCards.get(c.rank).push(c);
      }
      for(const order of variants){
        const maxLen=Math.min(order.length,hand.length);
        for(let len=rules.meld.runMin;len<=maxLen;len++){
          for(let start=0;start<=order.length-len;start++){
            const segment=order.slice(start,start+len),cards=[];let missing=0;
            for(const rank of segment){const arr=rankToCards.get(rank);if(arr?.length)cards.push(arr[0]);else missing++;}
            if(missing<=jokers.length&&cards.length+missing===len) add([...cards,...jokers.slice(0,missing)]);
          }
        }
      }
    }
    return candidates.sort((a,b)=>b.cards.length-a.cards.length||b.analysis.score-a.analysis.score);
  }

  function findBestEntryMelds(rules,active,hand,minScore){
    const candidates=enumerateCandidateMelds(rules,active,hand);let best=null;
    function dfs(index,used,chosen,score,count){
      if(score>=minScore){const cand={chosen:[...chosen],score,count};if(!best||cand.count>best.count||(cand.count===best.count&&cand.score>best.score))best=cand;}
      if(index>=candidates.length||chosen.length>=5)return;
      for(let i=index;i<candidates.length;i++){
        const c=candidates[i];if(c.cards.some(card=>used.has(card.uid)))continue;
        const next=new Set(used);c.cards.forEach(card=>next.add(card.uid));
        dfs(i+1,next,[...chosen,c],score+c.analysis.score,count+c.cards.length);
      }
    }
    dfs(0,new Set(),[],0,0);return best;
  }


  function cartesianPick(lists,visit,limitState,index=0,picked=[]){
    if(limitState.stop)return;
    if(index>=lists.length){visit([...picked]);return;}
    for(const item of lists[index]){
      picked.push(item);cartesianPick(lists,visit,limitState,index+1,picked);picked.pop();
      if(limitState.stop)return;
    }
  }

  // Enumeruje legalne meldy z dowolnej puli kart. W odróżnieniu od
  // enumerateCandidateMelds zachowuje alternatywne kopie tej samej karty
  // (ważne przy wielu taliach i przebudowie stołu).
  function enumeratePoolMelds(rules,active,cards,options={}){
    const maxCandidates=Math.max(100,Number(options.maxCandidates)||8000);
    const candidates=[],seen=new Set();
    const limitState={stop:false};
    const add=groupCards=>{
      if(limitState.stop||groupCards.length<Math.min(rules.meld.setMin,rules.meld.runMin))return;
      const key=groupCards.map(c=>c.uid).sort().join('|');
      if(seen.has(key))return;
      const analysis=analyzeGroup(rules,active,groupCards);
      if(!analysis.valid)return;
      seen.add(key);candidates.push({cards:[...groupCards],analysis,key});
      if(candidates.length>=maxCandidates)limitState.stop=true;
    };

    const jokers=cards.filter(c=>c.joker);

    // Grupy tej samej rangi, z różnymi kolorami.
    for(const rank of rules.cardModel.rankOrder){
      if(limitState.stop)break;
      const bySuit=new Map();
      for(const c of cards){
        if(c.joker||c.rank!==rank)continue;
        if(!bySuit.has(c.suit))bySuit.set(c.suit,[]);
        bySuit.get(c.suit).push(c);
      }
      const availableSuits=[...bySuit.keys()];
      for(let size=rules.meld.setMin;size<=rules.meld.setMax&&!limitState.stop;size++){
        for(let jokerCount=0;jokerCount<=Math.min(jokers.length,size)&&!limitState.stop;jokerCount++){
          const naturalCount=size-jokerCount;
          if(naturalCount<0||naturalCount>availableSuits.length)continue;
          for(const suitCombo of combinations(availableSuits,naturalCount)){
            if(limitState.stop)break;
            const naturalLists=suitCombo.map(s=>bySuit.get(s));
            const jokerCombos=jokerCount?combinations(jokers,jokerCount):[[]];
            for(const jokerCombo of jokerCombos){
              cartesianPick(naturalLists,naturalPick=>add([...naturalPick,...jokerCombo]),limitState);
              if(limitState.stop)break;
            }
          }
        }
      }
    }

    // Sekwensy. Joker może zastąpić także rangę, którą fizycznie mamy —
    // dzięki temu solver potrafi uwolnić naturalną kartę do innego układu.
    const variantMap=new Map();
    if(active.aceHigh)variantMap.set(rules.cardModel.rankOrder.join('|'),[...rules.cardModel.rankOrder]);
    if(active.aceLow){
      const low=['A',...rules.cardModel.rankOrder.filter(r=>r!=='A')];
      variantMap.set(low.join('|'),low);
    }
    for(const suit of SUIT_ORDER){
      if(limitState.stop)break;
      const byRank=new Map();
      for(const c of cards){
        if(c.joker||c.suit!==suit)continue;
        if(!byRank.has(c.rank))byRank.set(c.rank,[]);
        byRank.get(c.rank).push(c);
      }
      for(const order of variantMap.values()){
        if(limitState.stop)break;
        const maxLen=Math.min(order.length,cards.length);
        for(let len=rules.meld.runMin;len<=maxLen&&!limitState.stop;len++){
          for(let start=0;start<=order.length-len&&!limitState.stop;start++){
            const segment=order.slice(start,start+len);
            const mandatory=segment.filter(rank=>!(byRank.get(rank)?.length));
            if(mandatory.length>jokers.length)continue;
            const present=segment.filter(rank=>byRank.get(rank)?.length);
            const maxExtra=Math.min(jokers.length-mandatory.length,present.length);
            for(let extra=0;extra<=maxExtra&&!limitState.stop;extra++){
              for(const replaceRanks of combinations(present,extra)){
                if(limitState.stop)break;
                const jokerRanks=new Set([...mandatory,...replaceRanks]);
                const jokerCount=jokerRanks.size;
                const jokerCombos=jokerCount?combinations(jokers,jokerCount):[[]];
                const naturalLists=segment.filter(r=>!jokerRanks.has(r)).map(r=>byRank.get(r));
                for(const jokerCombo of jokerCombos){
                  cartesianPick(naturalLists,naturalPick=>add([...naturalPick,...jokerCombo]),limitState);
                  if(limitState.stop)break;
                }
              }
            }
          }
        }
      }
    }
    return candidates;
  }

  // Maksymalny zestaw rozłącznych legalnych meldów z dowolnej puli kart.
  // Używany m.in. przez lekki tooltip podpowiadający, ilu kart gracz może się
  // jeszcze pozbyć bez naruszania zasad.
  function findBestMeldPacking(rules,active,cards,options={}){
    if(!cards?.length)return null;
    const maxNodes=Math.max(1000,Number(options.maxNodes)||30000);
    const maxCandidates=Math.max(200,Number(options.maxCandidates)||6500);
    const minCards=Math.max(1,Number(options.minCards)||1);
    const candidates=enumeratePoolMelds(rules,active,cards,{maxCandidates})
      .sort((a,b)=>b.cards.length-a.cards.length||b.analysis.score-a.analysis.score);
    if(!candidates.length)return null;

    let nodes=0,best=null;
    const used=new Set(),chosen=[];
    function dfs(start,count){
      if(++nodes>maxNodes)return;
      if(!best||count>best.cardCount||(count===best.cardCount&&chosen.length<best.groups.length)){
        best={groups:chosen.map(c=>({cards:[...c.analysis.orderedCards],analysis:c.analysis})),cardCount:count,nodes};
        if(best.cardCount===cards.length)return;
      }
      if(count+(cards.length-used.size)<=best.cardCount)return;
      for(let i=start;i<candidates.length;i++){
        const cand=candidates[i];
        if(cand.cards.some(c=>used.has(c.uid)))continue;
        cand.cards.forEach(c=>used.add(c.uid));
        chosen.push(cand);
        dfs(i+1,count+cand.cards.length);
        chosen.pop();
        cand.cards.forEach(c=>used.delete(c.uid));
        if(nodes>maxNodes||best?.cardCount===cards.length)break;
      }
    }
    dfs(0,0);
    if(!best||best.cardCount<minCards)return null;
    const usedCardIds=[];
    for(const g of best.groups)for(const c of g.cards)usedCardIds.push(c.uid);
    return{groups:best.groups,usedCardIds:[...new Set(usedCardIds)],cardCount:best.cardCount,nodes,candidateCount:candidates.length,truncated:nodes>maxNodes};
  }

  // Exact-cover z kartami stołu jako elementami obowiązkowymi i kartami ręki
  // jako opcjonalnymi. Wynik maksymalizuje liczbę kart wyłożonych z ręki.
  function findBestTableRearrangement(rules,active,tableGroups,hand,options={}){
    const requiredCards=tableGroups.flatMap(g=>g.cards||[]);
    if(!requiredCards.length||!hand.length)return null;
    const requiredIds=new Set(requiredCards.map(c=>c.uid));
    const handIds=new Set(hand.map(c=>c.uid));
    const pool=[...requiredCards,...hand];
    const maxNodes=Math.max(1000,Number(options.maxNodes)||60000);
    const maxCandidates=Math.max(500,Number(options.maxCandidates)||9000);
    const minHandCards=Math.max(1,Number(options.minHandCards)||1);

    const candidateMap=new Map();
    const addCandidate=(cards,analysis)=>{
      if(!cards.some(c=>requiredIds.has(c.uid)))return;
      const key=cards.map(c=>c.uid).sort().join('|');
      if(candidateMap.has(key))return;
      candidateMap.set(key,{cards:[...cards],analysis:analysis||analyzeGroup(rules,active,cards),key});
    };
    for(const c of enumeratePoolMelds(rules,active,pool,{maxCandidates}))addCandidate(c.cards,c.analysis);
    // Oryginalne grupy zawsze są bezpieczną ścieżką pokrycia, nawet gdy
    // limit enumeracji odciął część kandydatów.
    for(const g of tableGroups){
      const analysis=analyzeGroup(rules,active,g.cards);
      if(analysis.valid)addCandidate(g.cards,analysis);
    }

    const candidates=[...candidateMap.values()].filter(c=>c.analysis.valid);
    const byRequired=new Map([...requiredIds].map(id=>[id,[]]));
    for(const c of candidates){
      for(const card of c.cards)if(requiredIds.has(card.uid))byRequired.get(card.uid).push(c);
    }
    if([...byRequired.values()].some(list=>!list.length))return null;
    for(const list of byRequired.values())list.sort((a,b)=>{
      const ah=a.cards.reduce((n,c)=>n+(handIds.has(c.uid)?1:0),0);
      const bh=b.cards.reduce((n,c)=>n+(handIds.has(c.uid)?1:0),0);
      return bh-ah||b.cards.length-a.cards.length;
    });

    let nodes=0,best=null;
    const used=new Set(),coveredRequired=new Set(),chosen=[];
    function dfs(handUsed){
      if(++nodes>maxNodes)return;
      if(coveredRequired.size===requiredIds.size){
        const solution={groups:chosen.map(c=>({cards:[...c.analysis.orderedCards],analysis:c.analysis})),handCount:handUsed,nodes};
        if(!best||solution.handCount>best.handCount||(solution.handCount===best.handCount&&solution.groups.length<best.groups.length))best=solution;
        return;
      }
      if(best&&handUsed+(hand.length-[...used].filter(id=>handIds.has(id)).length)<=best.handCount)return;

      let target=null,available=null;
      for(const id of requiredIds){
        if(coveredRequired.has(id))continue;
        const viable=byRequired.get(id).filter(c=>!c.cards.some(card=>used.has(card.uid)));
        if(!viable.length)return;
        if(!available||viable.length<available.length){target=id;available=viable;if(viable.length===1)break;}
      }
      if(target==null)return;
      for(const cand of available){
        const ids=cand.cards.map(c=>c.uid);
        const newlyRequired=ids.filter(id=>requiredIds.has(id));
        const addedHand=ids.reduce((n,id)=>n+(handIds.has(id)?1:0),0);
        ids.forEach(id=>used.add(id));
        newlyRequired.forEach(id=>coveredRequired.add(id));
        chosen.push(cand);
        dfs(handUsed+addedHand);
        chosen.pop();
        // Bezpieczne odznaczanie: ponieważ kandydaci nie mogą się nakładać,
        // wszystkie identyfikatory tej gałęzi zostały dodane właśnie tutaj.
        ids.forEach(id=>used.delete(id));
        newlyRequired.forEach(id=>coveredRequired.delete(id));
        if(nodes>maxNodes)break;
      }
    }
    dfs(0);
    if(!best||best.handCount<minHandCards)return null;
    const usedHandIds=[];
    for(const g of best.groups)for(const c of g.cards)if(handIds.has(c.uid))usedHandIds.push(c.uid);
    return{groups:best.groups,usedHandIds:[...new Set(usedHandIds)],handCount:best.handCount,nodes,candidateCount:candidates.length};
  }

  return{rankPoint,analyzeSet,analyzeRun,analyzeGroup,enumerateCandidateMelds,findBestEntryMelds,enumeratePoolMelds,findBestMeldPacking,findBestTableRearrangement,combinations};
});
