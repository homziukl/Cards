(() => {
  'use strict';

  const BUILD_VERSION='0.3.5';

  const SUITS = [
    { id:'S', symbol:'♠', name:'pik', red:false },
    { id:'H', symbol:'♥', name:'kier', red:true },
    { id:'D', symbol:'♦', name:'karo', red:true },
    { id:'C', symbol:'♣', name:'trefl', red:false },
  ];
  const BASE_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const DEFAULT_POINTS = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:10,Q:10,K:10,A:11 };

  const ids = [
    'deckCount','jokersPerDeck','playerCount','handSize','totalRounds','botStyle',
    'entryMin','drawPerTurn','runMin','setMin','aceLow','aceHigh','jokerWild','allowRearrange','initialMeldOwnCardsOnly',
    'rankEditor','roundRulesList','addRoundRuleBtn','applyRulesBtn','newGameBtn','exportBtn','loadJsonBtn','syncJsonBtn','rulesJson',
    'rulesPanel','toggleEditorBtn','closeEditorInlineBtn','showRulesBtn','activeRuleHint','rulesDialog','closeRulesDialogBtn','rulesHumanView','rulesDialogSubtitle',
    'turnLabel','scoreLabel','opponents','deckPile','deckCountLabel','drawBtn','drawState','newGroupBtn','undoTurnBtn','endTurnBtn',
    'meldBoard','boardValidation','playerHand','humanStatus','discardHint','playerMetaScore','log','toast'
  ];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

  let editorModel = normalizeRules(defaultRules());
  let rules = deepClone(editorModel);
  let state = null;
  let aiTimer = null;
  let groupUid = 1;
  let activeGroupId = null;
  let dragPayload = null;
  let discardHintTimer = null;
  let discardHintCache = { key:null, count:null };
  let touchDrag = null;
  let suppressClickUntil = 0;

  function defaultRules() {
    return {
      version: 3,
      preset: 'ukladanka',
      deck: { count:2, jokersPerDeck:1 },
      players: { count:2, handSize:7 },
      game: { totalRounds:1 },
      cardModel: {
        rankOrder:[...BASE_RANKS],
        rankPoints:{...DEFAULT_POINTS}
      },
      meld: {
        entryMin:30,
        drawPerTurn:1,
        runMin:3,
        setMin:3,
        setMax:4,
        aceLow:true,
        aceHigh:true,
        jokerWild:true,
        runSameSuit:true,
        setDistinctSuits:true,
        allowRearrange:true,
        initialMeldOwnCardsOnly:true,
        tableCardsStayOnTable:true,
        allowPassAfterDraw:true
      },
      ai:{ style:'careful' },
      rounds:[]
    };
  }

  function normalizeRules(raw) {
    const d = defaultRules();
    const r = raw && typeof raw === 'object' ? raw : {};
    const rankRaw = Array.isArray(r.cardModel?.rankOrder) ? r.cardModel.rankOrder.filter(x => BASE_RANKS.includes(x)) : d.cardModel.rankOrder;
    const rankOrder = [...rankRaw, ...BASE_RANKS.filter(x => !rankRaw.includes(x))];
    return {
      version:3,
      preset:'ukladanka',
      deck:{
        count:clampInt(r.deck?.count ?? d.deck.count,1,8),
        jokersPerDeck:clampInt(r.deck?.jokersPerDeck ?? d.deck.jokersPerDeck,0,4)
      },
      players:{
        count:clampInt(r.players?.count ?? d.players.count,2,6),
        handSize:clampInt(r.players?.handSize ?? d.players.handSize,1,30)
      },
      game:{ totalRounds:clampInt(r.game?.totalRounds ?? d.game.totalRounds,1,20) },
      cardModel:{
        rankOrder,
        rankPoints:Object.fromEntries(BASE_RANKS.map(rank => [rank, clampInt(r.cardModel?.rankPoints?.[rank] ?? d.cardModel.rankPoints[rank],0,99)]))
      },
      meld:{
        entryMin:clampInt(r.meld?.entryMin ?? d.meld.entryMin,0,999),
        drawPerTurn:clampInt(r.meld?.drawPerTurn ?? d.meld.drawPerTurn,0,10),
        runMin:clampInt(r.meld?.runMin ?? d.meld.runMin,3,13),
        setMin:clampInt(r.meld?.setMin ?? d.meld.setMin,3,4),
        setMax:4,
        aceLow:r.meld?.aceLow ?? d.meld.aceLow,
        aceHigh:r.meld?.aceHigh ?? d.meld.aceHigh,
        jokerWild:r.meld?.jokerWild ?? d.meld.jokerWild,
        runSameSuit:true,
        setDistinctSuits:true,
        allowRearrange:r.meld?.allowRearrange ?? d.meld.allowRearrange,
        initialMeldOwnCardsOnly:r.meld?.initialMeldOwnCardsOnly ?? d.meld.initialMeldOwnCardsOnly,
        tableCardsStayOnTable:true,
        allowPassAfterDraw:true
      },
      ai:{ style:['careful','greedy','random'].includes(r.ai?.style) ? r.ai.style : d.ai.style },
      rounds:Array.isArray(r.rounds) ? r.rounds.map(normalizeRoundOverride).filter(Boolean) : []
    };
  }

  function normalizeRoundOverride(item) {
    if (!item || typeof item !== 'object') return null;
    const round = clampInt(item.round,1,20);
    const o = item.override && typeof item.override === 'object' ? item.override : {};
    const override = {};
    if (Number.isFinite(Number(o.handSize)) && Number(o.handSize)>0) override.handSize=clampInt(o.handSize,1,30);
    if (Number.isFinite(Number(o.entryMin)) && Number(o.entryMin)>=0) override.entryMin=clampInt(o.entryMin,0,999);
    if (Number.isFinite(Number(o.drawPerTurn)) && Number(o.drawPerTurn)>=0) override.drawPerTurn=clampInt(o.drawPerTurn,0,10);
    if (typeof o.aceLow==='boolean') override.aceLow=o.aceLow;
    if (typeof o.aceHigh==='boolean') override.aceHigh=o.aceHigh;
    return { round, override };
  }

  function validateRules(r) {
    const issues=[];
    const total = r.deck.count * (52 + r.deck.jokersPerDeck);
    const maxHand = Math.max(r.players.handSize, ...r.rounds.map(x => Number(x.override.handSize)||0));
    if (r.players.count * maxHand > total) issues.push(`Za mało kart: potrzeba co najmniej ${r.players.count * maxHand}, a talie mają ${total}.`);
    if (new Set(r.cardModel.rankOrder).size !== BASE_RANKS.length) issues.push('Każda ranga musi wystąpić dokładnie raz w kolejności sekwensu.');
    if (!r.meld.aceLow && !r.meld.aceHigh) issues.push('As musi być dozwolony przynajmniej jako niski albo wysoki.');
    if (r.meld.setMin > r.meld.setMax) issues.push('Minimalna grupa nie może być większa niż 4.');
    const seen=new Set();
    for (const rr of r.rounds) {
      if (seen.has(rr.round)) issues.push(`Runda ${rr.round} ma więcej niż jedno nadpisanie.`);
      seen.add(rr.round);
      if (rr.round > r.game.totalRounds) issues.push(`Reguła rundy ${rr.round} wykracza poza liczbę rund (${r.game.totalRounds}).`);
    }
    return issues;
  }

  function effectiveRules(roundNo=state?.round ?? 1) {
    const o = rules.rounds.find(x => x.round===roundNo)?.override || {};
    return {
      handSize:o.handSize ?? rules.players.handSize,
      entryMin:o.entryMin ?? rules.meld.entryMin,
      drawPerTurn:o.drawPerTurn ?? rules.meld.drawPerTurn,
      aceLow:Object.prototype.hasOwnProperty.call(o,'aceLow') ? o.aceLow : rules.meld.aceLow,
      aceHigh:Object.prototype.hasOwnProperty.call(o,'aceHigh') ? o.aceHigh : rules.meld.aceHigh
    };
  }

  function syncFormFromEditorModel() {
    const r=editorModel;
    els.deckCount.value=r.deck.count;
    els.jokersPerDeck.value=r.deck.jokersPerDeck;
    els.playerCount.value=r.players.count;
    els.handSize.value=r.players.handSize;
    els.totalRounds.value=r.game.totalRounds;
    els.botStyle.value=r.ai.style;
    els.entryMin.value=r.meld.entryMin;
    els.drawPerTurn.value=r.meld.drawPerTurn;
    els.runMin.value=r.meld.runMin;
    els.setMin.value=r.meld.setMin;
    els.aceLow.checked=r.meld.aceLow;
    els.aceHigh.checked=r.meld.aceHigh;
    els.jokerWild.checked=r.meld.jokerWild;
    els.allowRearrange.checked=r.meld.allowRearrange;
    els.initialMeldOwnCardsOnly.checked=r.meld.initialMeldOwnCardsOnly;
    renderRankEditor();
    renderRoundRulesEditor();
    syncJsonText();
  }

  function readFormIntoEditorModel() {
    editorModel.deck.count=clampInt(els.deckCount.value,1,8);
    editorModel.deck.jokersPerDeck=clampInt(els.jokersPerDeck.value,0,4);
    editorModel.players.count=clampInt(els.playerCount.value,2,6);
    editorModel.players.handSize=clampInt(els.handSize.value,1,30);
    editorModel.game.totalRounds=clampInt(els.totalRounds.value,1,20);
    editorModel.ai.style=els.botStyle.value;
    editorModel.meld.entryMin=clampInt(els.entryMin.value,0,999);
    editorModel.meld.drawPerTurn=clampInt(els.drawPerTurn.value,0,10);
    editorModel.meld.runMin=clampInt(els.runMin.value,3,13);
    editorModel.meld.setMin=clampInt(els.setMin.value,3,4);
    editorModel.meld.aceLow=els.aceLow.checked;
    editorModel.meld.aceHigh=els.aceHigh.checked;
    editorModel.meld.jokerWild=els.jokerWild.checked;
    editorModel.meld.allowRearrange=els.allowRearrange.checked;
    editorModel.meld.initialMeldOwnCardsOnly=els.initialMeldOwnCardsOnly.checked;
  }

  function renderRankEditor() {
    els.rankEditor.innerHTML='';
    editorModel.cardModel.rankOrder.forEach((rank,index) => {
      const row=document.createElement('div'); row.className='order-row';
      row.innerHTML=`
        <div class="power">#${index+1}</div>
        <strong>${rank}</strong>
        <input type="number" min="0" max="99" value="${editorModel.cardModel.rankPoints[rank]}" title="Wartość punktowa">
        <div class="move-buttons"><button class="secondary" data-dir="-1">↑</button><button class="secondary" data-dir="1">↓</button></div>`;
      const input=row.querySelector('input');
      input.addEventListener('change',()=>{ editorModel.cardModel.rankPoints[rank]=clampInt(input.value,0,99); syncJsonText(); });
      row.querySelectorAll('button').forEach(btn => btn.addEventListener('click',()=>moveRank(index,Number(btn.dataset.dir))));
      els.rankEditor.appendChild(row);
    });
  }

  function moveRank(index,dir) {
    const target=index+dir;
    if (target<0 || target>=editorModel.cardModel.rankOrder.length) return;
    [editorModel.cardModel.rankOrder[index],editorModel.cardModel.rankOrder[target]]=[editorModel.cardModel.rankOrder[target],editorModel.cardModel.rankOrder[index]];
    renderRankEditor(); syncJsonText();
  }

  function addRoundRule(initial=null) {
    const used=new Set(editorModel.rounds.map(x=>x.round));
    let next=1; while (used.has(next) && next<=editorModel.game.totalRounds) next++;
    editorModel.rounds.push(initial || {round:Math.min(next,editorModel.game.totalRounds),override:{}});
    renderRoundRulesEditor(); syncJsonText();
  }

  function renderRoundRulesEditor() {
    els.roundRulesList.innerHTML='';
    editorModel.rounds.sort((a,b)=>a.round-b.round).forEach((rr,index)=>{
      const box=document.createElement('div'); box.className='round-rule';
      box.innerHTML=`
        <div class="round-rule-head"><span>Runda</span><input class="rr-round" type="number" min="1" max="${editorModel.game.totalRounds}" value="${rr.round}"><button class="secondary remove-round-rule">Usuń</button></div>
        <div class="round-rule-grid">
          <label>Kart na rękę<input class="rr-hand" type="number" min="1" max="30" placeholder="bazowe" value="${rr.override.handSize ?? ''}"></label>
          <label>Minimum wejścia<input class="rr-entry" type="number" min="0" max="999" placeholder="bazowe" value="${rr.override.entryMin ?? ''}"></label>
          <label>Dobieranie / turę<input class="rr-draw" type="number" min="0" max="10" placeholder="bazowe" value="${rr.override.drawPerTurn ?? ''}"></label>
          <label>As niski<select class="rr-ace-low"><option value="__base">bazowo</option><option value="true">tak</option><option value="false">nie</option></select></label>
          <label>As wysoki<select class="rr-ace-high"><option value="__base">bazowo</option><option value="true">tak</option><option value="false">nie</option></select></label>
        </div>`;
      setSelectValue(box.querySelector('.rr-ace-low'),Object.prototype.hasOwnProperty.call(rr.override,'aceLow')?String(rr.override.aceLow):'__base');
      setSelectValue(box.querySelector('.rr-ace-high'),Object.prototype.hasOwnProperty.call(rr.override,'aceHigh')?String(rr.override.aceHigh):'__base');
      box.addEventListener('change',()=>updateRoundRuleFromBox(index,box));
      box.querySelector('.remove-round-rule').addEventListener('click',()=>{ editorModel.rounds.splice(index,1); renderRoundRulesEditor(); syncJsonText(); });
      els.roundRulesList.appendChild(box);
    });
  }

  function updateRoundRuleFromBox(index,box) {
    const override={};
    const hand=box.querySelector('.rr-hand').value;
    const entry=box.querySelector('.rr-entry').value;
    const draw=box.querySelector('.rr-draw').value;
    const low=box.querySelector('.rr-ace-low').value;
    const high=box.querySelector('.rr-ace-high').value;
    if (hand!=='') override.handSize=clampInt(hand,1,30);
    if (entry!=='') override.entryMin=clampInt(entry,0,999);
    if (draw!=='') override.drawPerTurn=clampInt(draw,0,10);
    if (low!=='__base') override.aceLow=low==='true';
    if (high!=='__base') override.aceHigh=high==='true';
    editorModel.rounds[index]={round:clampInt(box.querySelector('.rr-round').value,1,editorModel.game.totalRounds),override};
    syncJsonText();
  }

  function syncJsonText() {
    readFormIntoEditorModel();
    els.rulesJson.value=JSON.stringify(editorModel,null,2);
  }

  function applyRules() {
    syncJsonText();
    const normalized=normalizeRules(editorModel);
    const issues=validateRules(normalized);
    if (issues.length) { toast(issues[0]); return; }
    editorModel=normalized; rules=deepClone(normalized); syncFormFromEditorModel(); newGame();
  }

  function loadJson() {
    try {
      const normalized=normalizeRules(JSON.parse(els.rulesJson.value));
      const issues=validateRules(normalized); if (issues.length) throw new Error(issues.join('\n'));
      editorModel=normalized; syncFormFromEditorModel(); toast('Reguły wczytane. Kliknij „Zastosuj i rozdaj”.');
    } catch(err) { toast(`Błąd JSON: ${err.message}`); }
  }

  function exportJson() {
    syncJsonText();
    const blob=new Blob([els.rulesJson.value],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='card-sandbox-siodemki-v0.3.5.json'; a.click(); URL.revokeObjectURL(url);
  }

  function makeDeck() {
    const cards=[]; let uid=1;
    for (let d=0; d<rules.deck.count; d++) {
      for (const suit of SUITS) for (const rank of BASE_RANKS) cards.push({uid:`c${uid++}`,deckIndex:d,suit:suit.id,rank,joker:false});
      for (let j=0;j<rules.deck.jokersPerDeck;j++) cards.push({uid:`c${uid++}`,deckIndex:d,suit:null,rank:'JOKER',joker:true});
    }
    return shuffle(cards);
  }

  function newGame() {
    clearTimeout(aiTimer);
    const issues=validateRules(rules); if (issues.length) { toast(issues[0]); return; }
    state={
      players:Array.from({length:rules.players.count},(_,i)=>({id:i,name:i===0?'Ty':`Bot ${i}`,human:i===0,hand:[],entered:false,roundWins:0})),
      deck:[], tableGroups:[], turn:0, leader:0, round:1, finished:false,
      drawnThisTurn:0, turnSnapshot:null, turnStartTableIds:new Set(), turnOwnedCardIds:new Set(), turnStartGroupSignatures:new Map(),
      consecutiveNoPlayTurns:0
    };
    activeGroupId=null; logClear(); startRound(1);
  }

  function startRound(roundNo) {
    state.round=roundNo; state.deck=makeDeck(); state.tableGroups=[]; activeGroupId=null; state.finished=false; state.consecutiveNoPlayTurns=0;
    const er=effectiveRules(roundNo);
    for (const p of state.players) { p.hand=[]; p.entered=false; }
    for (let n=0;n<er.handSize;n++) for (const p of state.players) p.hand.push(state.deck.pop());
    state.turn=state.leader % state.players.length;
    log(`Runda ${roundNo}/${rules.game.totalRounds}: rozdano po ${er.handSize} kart. Wejście: ${er.entryMin} pkt.`);
    beginTurn();
  }

  function beginTurn() {
    clearTimeout(aiTimer);
    const p=state.players[state.turn];
    state.drawnThisTurn=0;
    state.turnStartTableIds=new Set(allTableCards().map(c=>c.uid));
    state.turnOwnedCardIds=new Set(p.hand.map(c=>c.uid));
    state.turnStartGroupSignatures=new Map(state.tableGroups.map(g=>[g.id,groupSignature(g)]));
    state.turnSnapshot=snapshotForUndo();
    activeGroupId=state.tableGroups[0]?.id ?? null;
    log(`${p.name}: początek tury${p.entered?' · już w grze':' · jeszcze bez wejścia'}.`);
    render();
    if (!p.human) maybeRunAI();
  }

  function snapshotForUndo() {
    return {
      deck:deepClone(state.deck),
      tableGroups:deepClone(state.tableGroups),
      players:state.players.map(p=>({hand:deepClone(p.hand),entered:p.entered})),
      drawnThisTurn:state.drawnThisTurn,
      activeGroupId
    };
  }

  function undoTurn() {
    if (!state || state.finished || state.turn!==0 || !state.turnSnapshot) return;
    const snap=state.turnSnapshot;
    state.deck=deepClone(snap.deck); state.tableGroups=deepClone(snap.tableGroups);
    state.players.forEach((p,i)=>{ p.hand=deepClone(snap.players[i].hand); p.entered=snap.players[i].entered; });
    activeGroupId=snap.activeGroupId ?? state.tableGroups[0]?.id ?? null;
    state.drawnThisTurn=0;
    state.turnStartTableIds=new Set(allTableCards().map(c=>c.uid));
    state.turnOwnedCardIds=new Set(state.players[0].hand.map(c=>c.uid));
    state.turnStartGroupSignatures=new Map(state.tableGroups.map(g=>[g.id,groupSignature(g)]));
    log('Ty: cofnięto całą bieżącą turę.'); render();
  }

  function drawCard(playerId,quiet=false) {
    if (!state || state.finished || state.turn!==playerId) return false;
    const er=effectiveRules();
    if (state.drawnThisTurn>=er.drawPerTurn) { if(!quiet) toast('W tej turze masz już wymagane dobieranie za sobą.'); return false; }
    if (!state.deck.length) { if(!quiet) toast('Talia jest pusta.'); return false; }
    const card=state.deck.pop(); state.players[playerId].hand.push(card); state.turnOwnedCardIds.add(card.uid); state.drawnThisTurn++;
    log(`${state.players[playerId].name} dobiera kartę (${state.drawnThisTurn}/${er.drawPerTurn}).`); render(); return true;
  }

  function drawRequirementMet() {
    const er=effectiveRules();
    return state.drawnThisTurn>=er.drawPerTurn || state.deck.length===0;
  }

  function createGroup(select=true) {
    if (!canHumanManipulate()) return null;
    if (!drawRequirementMet()) { toast('Najpierw dobierz kartę.'); return null; }
    const g={id:`g${groupUid++}`,cards:[]}; state.tableGroups.push(g); if (select) activeGroupId=g.id; render(); return g;
  }

  function addHandCardToActive(cardUid) {
    if (!canHumanManipulate()) return;
    if (!drawRequirementMet()) { toast('Najpierw dobierz kartę.'); return; }
    let group=state.tableGroups.find(g=>g.id===activeGroupId);
    if (!group) group=createGroup(true);
    if (!group) return;
    if (!canDropHandCardIntoGroup(group)) return;
    const p=state.players[0]; const idx=p.hand.findIndex(c=>c.uid===cardUid); if (idx<0) return;
    const [card]=p.hand.splice(idx,1); group.cards.push(card); cleanupEmptyGroups(); render();
  }

  function canDropHandCardIntoGroup(group,showToast=true) {
    const p=state.players[state.turn];
    if (!p.entered && rules.meld.initialMeldOwnCardsOnly && state.turnStartGroupSignatures.has(group.id)) {
      if(showToast) toast(`Przed wejściem za ${effectiveRules().entryMin} pkt nie możesz korzystać ze starych układów stołu.`);
      return false;
    }
    return true;
  }

  function moveTableCard(cardUid,fromGroupId,toGroupId) {
    if (!canHumanManipulate()) return;
    if (!drawRequirementMet()) { toast('Najpierw dobierz kartę.'); return; }
    if (fromGroupId===toGroupId) return;
    const p=state.players[0];
    const from=state.tableGroups.find(g=>g.id===fromGroupId); const to=state.tableGroups.find(g=>g.id===toGroupId);
    if (!from || !to) return;
    if (!p.entered) {
      const movingOldTableCard=state.turnStartTableIds.has(cardUid);
      const targetIsOldGroup=state.turnStartGroupSignatures.has(toGroupId);
      if (movingOldTableCard || targetIsOldGroup) { toast('Przed własnym wejściem możesz przestawiać tylko swoje karty pomiędzy nowymi układami.'); return; }
    }
    if (!rules.meld.allowRearrange && state.turnStartTableIds.has(cardUid)) { toast('Przebudowa istniejących układów jest wyłączona.'); return; }
    const idx=from.cards.findIndex(c=>c.uid===cardUid); if(idx<0) return;
    const [card]=from.cards.splice(idx,1); to.cards.push(card); cleanupEmptyGroups(); activeGroupId=to.id; render();
  }

  function returnCardToHand(cardUid,fromGroupId) {
    if (!canHumanManipulate()) return;
    if (!state.turnOwnedCardIds.has(cardUid) || state.turnStartTableIds.has(cardUid)) { toast('Karta, która była na stole przed turą, musi pozostać na stole.'); return; }
    const from=state.tableGroups.find(g=>g.id===fromGroupId); if (!from) return;
    const idx=from.cards.findIndex(c=>c.uid===cardUid); if(idx<0) return;
    const [card]=from.cards.splice(idx,1); state.players[0].hand.push(card); cleanupEmptyGroups(); render();
  }

  function cleanupEmptyGroups() {
    state.tableGroups=state.tableGroups.filter(g=>g.cards.length>0 || g.id===activeGroupId);
    if (activeGroupId && !state.tableGroups.some(g=>g.id===activeGroupId)) activeGroupId=state.tableGroups[0]?.id ?? null;
  }

  function canHumanManipulate() { return state && !state.finished && state.turn===0; }

  function allTableCards() { return state.tableGroups.flatMap(g=>g.cards); }
  function groupSignature(g) { return [...g.cards.map(c=>c.uid)].sort().join('|'); }

  const Engine=window.CardSandboxEngine;

  function analyzeGroup(cards,roundNo=state?.round ?? 1) { return Engine.analyzeGroup(rules,effectiveRules(roundNo),cards); }
  function invalidAnalysis(reason) { return {valid:false,type:null,score:0,reason,orderedCards:[],jokerAssignments:{}}; }
  function rankPoint(rank,aceAsLow=false) { return Engine.rankPoint(rules,rank,aceAsLow); }

  function validateWholeBoard() {
    const details=state.tableGroups.filter(g=>g.cards.length).map(g=>({group:g,analysis:analyzeGroup(g.cards)}));
    const invalid=details.filter(x=>!x.analysis.valid);
    const tableIds=new Set(allTableCards().map(c=>c.uid));
    const missingOld=[...state.turnStartTableIds].filter(uid=>!tableIds.has(uid));
    if (missingOld.length) return {valid:false,details,reason:'Co najmniej jedna karta, która była wcześniej na stole, zniknęła ze stołu.'};
    if (invalid.length) return {valid:false,details,reason:`Nielegalny układ: ${invalid[0].analysis.reason}`};
    return {valid:true,details,reason:''};
  }

  function initialEntryScore(playerId,boardValidation) {
    const p=state.players[playerId];
    if (p.entered) return 0;
    let score=0;
    for (const {group,analysis} of boardValidation.details) {
      if (state.turnStartGroupSignatures.has(group.id)) continue;
      if (!group.cards.every(c=>state.turnOwnedCardIds.has(c.uid))) return -1;
      score+=analysis.score;
    }
    return score;
  }

  function verifyInitialTableUntouched(playerId) {
    const p=state.players[playerId];
    if (p.entered || !rules.meld.initialMeldOwnCardsOnly) return true;
    for (const [groupId,sig] of state.turnStartGroupSignatures.entries()) {
      const current=state.tableGroups.find(g=>g.id===groupId);
      if (!current || groupSignature(current)!==sig) return false;
    }
    return true;
  }

  function endTurn(playerId,{ai=false}={}) {
    if (!state || state.finished || state.turn!==playerId) return false;
    const p=state.players[playerId]; const er=effectiveRules();
    if (!drawRequirementMet()) { if(!ai) toast(`Najpierw dobierz ${er.drawPerTurn} kartę/karty.`); return false; }
    if (!verifyInitialTableUntouched(playerId)) { if(!ai) toast('Przed pierwszym wejściem nie wolno ruszać układów już leżących na stole.'); return false; }
    const board=validateWholeBoard();
    if (!board.valid) { if(!ai) toast(board.reason); render(); return false; }

    const newlyCommitted=allTableCards().filter(c=>state.turnOwnedCardIds.has(c.uid) && !state.turnStartTableIds.has(c.uid));
    if (!p.entered && newlyCommitted.length) {
      const entryScore=initialEntryScore(playerId,board);
      if (entryScore<0) { if(!ai) toast('Wejście musi być zbudowane wyłącznie z Twoich kart.'); return false; }
      if (entryScore<er.entryMin) { if(!ai) toast(`Za mało na wejście: ${entryScore} pkt. Potrzeba minimum ${er.entryMin}.`); return false; }
      p.entered=true; log(`${p.name} wchodzi do gry za ${entryScore} pkt.`);
    }

    canonicalizeBoard(board);
    const playedCount=newlyCommitted.length;
    log(`${p.name}: PROSZĘ — tura zatwierdzona${playedCount?` · wyłożono ${playedCount} kart(y)`:''}.`);
    state.consecutiveNoPlayTurns = playedCount ? 0 : state.consecutiveNoPlayTurns + 1;

    if (p.hand.length===0) { winRound(playerId); return true; }
    if (!state.deck.length && state.consecutiveNoPlayTurns>=state.players.length) { resolveStalemate(); return true; }

    state.turn=nextPlayer(playerId); activeGroupId=null; beginTurn(); return true;
  }

  function canonicalizeBoard(boardValidation) {
    for (const {group,analysis} of boardValidation.details) group.cards=[...analysis.orderedCards];
    state.tableGroups=state.tableGroups.filter(g=>g.cards.length>0);
    if (activeGroupId && !state.tableGroups.some(g=>g.id===activeGroupId)) activeGroupId=state.tableGroups[0]?.id ?? null;
  }

  function nextPlayer(id) { return (id+1)%state.players.length; }

  function winRound(playerId) {
    const p=state.players[playerId]; p.roundWins++; state.leader=playerId;
    log(`${p.name} pozbywa się wszystkich kart i wygrywa rundę ${state.round}.`);
    if (state.round>=rules.game.totalRounds) { finishGame(); return; }
    state.round++; setTimeout(()=>startRound(state.round),650);
  }

  function resolveStalemate() {
    const scores=state.players.map(p=>({id:p.id,value:handValue(p.hand)})).sort((a,b)=>a.value-b.value);
    const best=scores[0].value; const winners=scores.filter(x=>x.value===best);
    winners.forEach(x=>state.players[x.id].roundWins++);
    state.leader=winners[0].id;
    log(`Talia pusta i pełna kolejka bez wyłożenia. Rundę bierze ${winners.map(x=>state.players[x.id].name).join(', ')} z ręką ${best} pkt.`);
    if (state.round>=rules.game.totalRounds) finishGame(); else { state.round++; setTimeout(()=>startRound(state.round),650); }
  }

  function finishGame() {
    state.finished=true; clearTimeout(aiTimer);
    const best=Math.max(...state.players.map(p=>p.roundWins)); const winners=state.players.filter(p=>p.roundWins===best);
    log(`Koniec gry. ${winners.map(p=>p.name).join(', ')} — wygrane rundy: ${best}.`); toast(`Koniec gry: ${winners.map(p=>p.name).join(', ')}`); render();
  }

  function handValue(hand) { return hand.reduce((s,c)=>s+(c.joker?0:rankPoint(c.rank,false)),0); }

  function enumerateCandidateMelds(hand) { return Engine.enumerateCandidateMelds(rules,effectiveRules(),hand); }

  function findBestEntryMelds(hand,minScore) { return Engine.findBestEntryMelds(rules,effectiveRules(),hand,minScore); }

  function aiRearrangeUsingTable(p) {
    if (!p.entered || !rules.meld.allowRearrange || !state.tableGroups.length || !p.hand.length) return 0;
    let totalPlayed=0;

    // Kilka kolejnych lokalnych przebudów pozwala botowi najpierw rozbić
    // jeden układ, a potem wykorzystać nowy stan stołu przy następnym ruchu.
    for (let pass=0; pass<3 && p.hand.length; pass++) {
      let bestMove=null;
      const consider=(groups,kind)=>{
        const solution=Engine.findBestTableRearrangement(rules,effectiveRules(),groups,p.hand,{
          maxNodes: rules.ai.style==='greedy' ? 90000 : 60000,
          maxCandidates: 10000,
          minHandCards:1
        });
        if (!solution) return;
        const candidate={groups,solution,kind};
        if (!bestMove || solution.handCount>bestMove.solution.handCount ||
            (solution.handCount===bestMove.solution.handCount && solution.groups.length<bestMove.solution.groups.length)) bestMove=candidate;
      };

      // Najpierw próbujemy przebudować każdy pojedynczy meld z użyciem ręki.
      for (const group of state.tableGroups) consider([group],'single');

      // Jeżeli pojedynczy meld nie daje dużej korzyści, pozwalamy także na
      // przełożenie kart pomiędzy dwiema istniejącymi kupkami. Limit rozmiaru
      // chroni przeglądarkę przed eksplozją kombinatoryczną.
      if ((!bestMove || bestMove.solution.handCount<3) && state.tableGroups.length<=10) {
        let pairChecks=0;
        for (let i=0;i<state.tableGroups.length && pairChecks<16;i++) {
          for (let j=i+1;j<state.tableGroups.length && pairChecks<16;j++) {
            const a=state.tableGroups[i], b=state.tableGroups[j];
            if (a.cards.length+b.cards.length>12) continue;
            pairChecks++; consider([a,b],'pair');
          }
        }
      }

      if (!bestMove || bestMove.solution.handCount<1) break;
      applyAiRearrangement(p,bestMove);
      totalPlayed+=bestMove.solution.handCount;

      if (rules.ai.style==='random') break;
      if (rules.ai.style==='careful' && totalPlayed>=4) break;
    }
    return totalPlayed;
  }

  function applyAiRearrangement(p,move) {
    const selectedIds=new Set(move.groups.map(g=>g.id));
    const indices=move.groups.map(g=>state.tableGroups.findIndex(x=>x.id===g.id)).filter(i=>i>=0);
    const insertAt=indices.length?Math.min(...indices):state.tableGroups.length;
    const usedHand=new Set(move.solution.usedHandIds);
    p.hand=p.hand.filter(c=>!usedHand.has(c.uid));

    const replacements=move.solution.groups.map(result=>({
      id:`g${groupUid++}`,
      cards:[...result.cards]
    }));
    const remaining=state.tableGroups.filter(g=>!selectedIds.has(g.id));
    remaining.splice(Math.min(insertAt,remaining.length),0,...replacements);
    state.tableGroups=remaining;

    log(`${p.name}: przebudowuje ${move.groups.length===1?'układ':'układy'} stołu i wykorzystuje ${move.solution.handCount} kart(y) z ręki.`);
  }

  function aiTakeTurn(playerId) {
    if (!state || state.finished || state.turn!==playerId) return;
    const p=state.players[playerId]; const er=effectiveRules();
    while(state.drawnThisTurn<er.drawPerTurn && state.deck.length) drawCard(playerId,true);

    let played=0;
    if (!p.entered) {
      const solution=findBestEntryMelds(p.hand,er.entryMin);
      if(solution) {
        for(const candidate of solution.chosen) {
          const group={id:`g${groupUid++}`,cards:[]};
          for(const card of candidate.cards) {
            const idx=p.hand.findIndex(c=>c.uid===card.uid); if(idx>=0) group.cards.push(p.hand.splice(idx,1)[0]);
          }
          state.tableGroups.push(group); played+=group.cards.length;
        }
      }
    } else {
      // Najpierw pełnoprawna przebudowa stołu: bot może używać starych kart,
      // dzielić meldy, przenosić karty między kupkami i uwalniać jokery.
      played += aiRearrangeUsingTable(p);
      played += aiExtendExistingGroups(p);
      const standalone=enumerateCandidateMelds(p.hand);
      const used=new Set();
      for(const candidate of standalone) {
        if(candidate.cards.some(c=>used.has(c.uid))) continue;
        const group={id:`g${groupUid++}`,cards:[]};
        for(const card of candidate.cards) {
          const idx=p.hand.findIndex(c=>c.uid===card.uid); if(idx>=0) { const [moved]=p.hand.splice(idx,1); group.cards.push(moved); used.add(moved.uid); }
        }
        if(group.cards.length) { state.tableGroups.push(group); played+=group.cards.length; }
        if(rules.ai.style==='careful' && played>=3) break;
      }
    }

    render();
    aiTimer=setTimeout(()=>{
      if (!endTurn(playerId,{ai:true})) {
        // Bezpieczny rollback, jeśli algorytm bota ułożył coś niepoprawnie.
        restoreAiSnapshotAndPass(playerId);
      }
    },420);
  }

  function aiExtendExistingGroups(p) {
    let played=0; let progress=true;
    while(progress) {
      progress=false;
      outer: for(let hi=0;hi<p.hand.length;hi++) {
        const card=p.hand[hi];
        for(const group of state.tableGroups) {
          const analysis=analyzeGroup([...group.cards,card]);
          if(analysis.valid) {
            group.cards.push(p.hand.splice(hi,1)[0]); played++; progress=true; break outer;
          }
        }
      }
      if(rules.ai.style==='careful' && played>=2) break;
      if(rules.ai.style==='random' && played>=1) break;
    }
    return played;
  }

  function restoreAiSnapshotAndPass(playerId) {
    const snap=state.turnSnapshot;
    state.deck=deepClone(snap.deck); state.tableGroups=deepClone(snap.tableGroups);
    state.players.forEach((p,i)=>{ p.hand=deepClone(snap.players[i].hand); p.entered=snap.players[i].entered; });
    state.drawnThisTurn=0;
    while(state.drawnThisTurn<effectiveRules().drawPerTurn && state.deck.length) drawCard(playerId,true);
    log(`${state.players[playerId].name}: brak bezpiecznego układu — kończy turę po dobraniu.`);
    endTurn(playerId,{ai:true});
  }

  function maybeRunAI() {
    clearTimeout(aiTimer); if(!state || state.finished) return;
    const p=state.players[state.turn]; if(!p || p.human) return;
    aiTimer=setTimeout(()=>aiTakeTurn(p.id),500);
  }

  // Licznik podpowiedzi dla człowieka. Nie wykonuje ruchu — pyta solver,
  // ile kart z aktualnej ręki da się jeszcze legalnie dołączyć do stołu.
  function bestStandalonePacking(hand) {
    if(!hand.length) return {count:0,usedCardIds:[]};
    const solution=Engine.findBestMeldPacking(rules,effectiveRules(),hand,{maxNodes:26000,maxCandidates:6500,minCards:1});
    return solution ? {count:solution.cardCount,usedCardIds:solution.usedCardIds} : {count:0,usedCardIds:[]};
  }

  function combineRearrangementWithStandalone(solution,hand) {
    if(!solution) return 0;
    const used=new Set(solution.usedHandIds||[]);
    const remaining=hand.filter(c=>!used.has(c.uid));
    return solution.handCount + bestStandalonePacking(remaining).count;
  }

  function estimateDiscardableCards() {
    if(!state || state.finished || state.turn!==0 || !drawRequirementMet()) return null;
    const p=state.players[0], er=effectiveRules();
    if(!p.hand.length) return 0;

    if(!p.entered) {
      const entry=findBestEntryMelds(p.hand,er.entryMin);
      return entry ? entry.count : 0;
    }

    let best=bestStandalonePacking(p.hand).count;
    if(!rules.meld.allowRearrange || !state.tableGroups.length) return best;

    const nonEmpty=state.tableGroups.filter(g=>g.cards.length);
    const consider=(groups,maxNodes=32000,maxCandidates=7000)=>{
      const solution=Engine.findBestTableRearrangement(rules,er,groups,p.hand,{maxNodes,maxCandidates,minHandCards:1});
      best=Math.max(best,combineRearrangementWithStandalone(solution,p.hand));
    };

    // Dla niedużego stołu próbujemy całej układanki naraz. Przy większym
    // stole schodzimy do lokalnych układów/par, żeby tooltip pozostał lekki.
    const tableCardCount=nonEmpty.reduce((n,g)=>n+g.cards.length,0);
    if(nonEmpty.length<=7 && tableCardCount<=24) consider(nonEmpty,52000,9000);

    for(const group of nonEmpty) consider([group],22000,5000);
    if(nonEmpty.length<=10) {
      let checks=0;
      for(let i=0;i<nonEmpty.length && checks<10;i++) {
        for(let j=i+1;j<nonEmpty.length && checks<10;j++) {
          if(nonEmpty[i].cards.length+nonEmpty[j].cards.length>12) continue;
          checks++; consider([nonEmpty[i],nonEmpty[j]],26000,6000);
        }
      }
    }
    return Math.min(best,p.hand.length);
  }

  function discardHintKey() {
    if(!state) return 'none';
    const hand=state.players[0].hand.map(c=>c.uid).sort().join(',');
    const table=state.tableGroups.map(g=>g.cards.map(c=>c.uid).sort().join(',')).sort().join(';');
    return [state.round,state.turn,state.finished?1:0,state.players[0].entered?1:0,state.drawnThisTurn,hand,table].join('|');
  }

  function setDiscardHint(count,message=null) {
    if(!els.discardHint) return;
    els.discardHint.classList.remove('pending','zero','good','disabled');
    if(count===null) {
      els.discardHint.textContent='↘ —';
      els.discardHint.classList.add('disabled');
      els.discardHint.title=message||'Podpowiedź jest dostępna po dobraniu karty w Twojej turze.';
      return;
    }
    els.discardHint.textContent=`↘ ${count}`;
    els.discardHint.classList.add(count>0?'good':'zero');
    els.discardHint.title=message||`Solver widzi możliwość legalnego wyłożenia jeszcze ${count} ${count===1?'karty':(count>=2&&count<=4?'kart':'kart')} z obecnej ręki.`;
  }

  function scheduleDiscardHint() {
    if(!els.discardHint) return;
    clearTimeout(discardHintTimer);
    if(!state || state.finished) { setDiscardHint(null,'Gra jest zakończona.'); return; }
    if(state.turn!==0) { setDiscardHint(null,'Podpowiedź pojawi się w Twojej turze.'); return; }
    if(!drawRequirementMet()) { setDiscardHint(null,'Najpierw dobierz wymaganą kartę.'); return; }

    const key=discardHintKey();
    if(discardHintCache.key===key && discardHintCache.count!==null) { setDiscardHint(discardHintCache.count); return; }
    els.discardHint.textContent='↘ …';
    els.discardHint.className='discard-hint pending';
    els.discardHint.title='Solver sprawdza, ile kart możesz jeszcze legalnie wyłożyć.';
    discardHintTimer=setTimeout(()=>{
      const before=discardHintKey();
      const count=estimateDiscardableCards();
      if(before!==discardHintKey()) return;
      discardHintCache={key:before,count};
      setDiscardHint(count);
    },90);
  }

  function render() {
    if(!state) return;
    const p=state.players[state.turn]; const er=effectiveRules();
    els.deckCountLabel.textContent=state.deck.length;
    els.deckPile.disabled=state.finished || state.turn!==0 || state.drawnThisTurn>=er.drawPerTurn || !state.deck.length;
    els.drawBtn.disabled=els.deckPile.disabled;
    els.drawBtn.textContent=er.drawPerTurn>1?`Dobierz (${state.drawnThisTurn}/${er.drawPerTurn})`:'Dobierz 1';
    els.drawState.textContent=drawRequirementMet()?'możesz układać':`${Math.max(0,er.drawPerTurn-state.drawnThisTurn)} do dobrania`;
    els.turnLabel.textContent=state.finished?'Koniec gry':`Runda ${state.round}/${rules.game.totalRounds} · tura: ${p.name}`;
    els.activeRuleHint.textContent=`wejście ${er.entryMin} · As 1/${rules.cardModel.rankPoints.A} · stół transakcyjny`;
    els.scoreLabel.textContent=state.players.map(pl=>`${pl.name}: ${pl.roundWins}W`).join(' · ');
    els.humanStatus.textContent=`Ty · ${state.players[0].entered?'WEJŚCIE ✓':'bez wejścia'}`;
    els.playerMetaScore.textContent=`Ręka: ${state.players[0].hand.length} kart · ${handValue(state.players[0].hand)} pkt`;
    scheduleDiscardHint();
    els.newGroupBtn.disabled=!canHumanManipulate() || !drawRequirementMet();
    els.undoTurnBtn.disabled=!canHumanManipulate();
    els.endTurnBtn.disabled=!canHumanManipulate();
    renderOpponents(); renderBoard(); renderHumanHand();
  }

  function renderOpponents() {
    els.opponents.innerHTML='';
    for(const p of state.players.slice(1)) {
      const wrap=document.createElement('div'); wrap.className='opponent';
      wrap.innerHTML=`<div class="name">${escapeHtml(p.name)} · ${p.hand.length} kart <span class="entered-badge ${p.entered?'yes':''}">${p.entered?'WEJŚCIE ✓':'bez wejścia'}</span></div>`;
      const hand=document.createElement('div'); hand.className='mini-hand';
      p.hand.forEach(()=>{const back=document.createElement('div'); back.className='card back'; hand.appendChild(back);});
      wrap.appendChild(hand); els.opponents.appendChild(wrap);
    }
  }

  function renderBoard() {
    els.meldBoard.innerHTML='';
    if(!state.tableGroups.length) {
      const empty=document.createElement('div'); empty.className='meld-empty'; empty.textContent='Stół jest pusty. Dobierz kartę i utwórz pierwszy układ.'; els.meldBoard.appendChild(empty);
    }
    let validCount=0, invalidCount=0;
    for(const group of state.tableGroups) {
      const analysis=group.cards.length?analyzeGroup(group.cards):invalidAnalysis('Pusty układ');
      if(analysis.valid) validCount++; else if(group.cards.length) invalidCount++;
      const box=document.createElement('div'); box.className=`meld-group ${group.id===activeGroupId?'active':''} ${group.cards.length?(analysis.valid?'valid':'invalid'):''}`; box.dataset.groupId=group.id;
      const status=group.cards.length ? (analysis.valid ? `✓ ${analysis.type==='run'?'sekwens':'grupa'} · ${analysis.score} pkt` : `✕ ${analysis.reason}`) : 'pusty — wrzuć karty';
      box.innerHTML=`<div class="meld-head"><span>Układ ${escapeHtml(group.id.replace('g','#'))}</span><span class="meld-status ${analysis.valid?'valid':'invalid'}">${escapeHtml(status)}</span></div><div class="meld-cards"></div>`;
      box.addEventListener('click',e=>{ if(e.target.closest('.card')) return; activeGroupId=group.id; renderBoard(); });
      setupGroupDrop(box,group);
      const cardsEl=box.querySelector('.meld-cards');
      const displayCards=analysis.valid?analysis.orderedCards:group.cards;
      for(const card of displayCards) {
        const node=cardElement(card,analysis.jokerAssignments?.[card.uid]);
        if(canHumanManipulate() && drawRequirementMet()) {
          const canMove=state.players[0].entered && (rules.meld.allowRearrange || !state.turnStartTableIds.has(card.uid));
          if(canMove || state.turnOwnedCardIds.has(card.uid)) {
            node.draggable=true; node.classList.add('clickable');
            node.addEventListener('dragstart',e=>{ dragPayload={type:'table',cardUid:card.uid,fromGroupId:group.id}; node.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
            node.addEventListener('dragend',()=>{node.classList.remove('dragging'); dragPayload=null;});
            attachTouchDrag(node,()=>({type:'table',cardUid:card.uid,fromGroupId:group.id}));
            node.addEventListener('click',e=>{
              if(Date.now()<suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
              e.stopPropagation();
              if(activeGroupId && activeGroupId!==group.id) moveTableCard(card.uid,group.id,activeGroupId);
              else activeGroupId=group.id;
            });
            if(state.turnOwnedCardIds.has(card.uid) && !state.turnStartTableIds.has(card.uid)) node.addEventListener('dblclick',e=>{e.stopPropagation();returnCardToHand(card.uid,group.id);});
          }
        }
        cardsEl.appendChild(node);
      }
      els.meldBoard.appendChild(box);
    }
    const allValid=invalidCount===0;
    els.boardValidation.className=`board-validation ${allValid?'ok':'bad'}`;
    els.boardValidation.textContent=allValid ? `${validCount} poprawnych układów` : `${invalidCount} niepoprawnych układów`;
  }

  function setupGroupDrop(box,group) {
    box.addEventListener('dragover',e=>{ if(!canHumanManipulate())return; e.preventDefault(); e.dataTransfer.dropEffect='move'; box.classList.add('active'); });
    box.addEventListener('dragleave',()=>{ if(group.id!==activeGroupId) box.classList.remove('active'); });
    box.addEventListener('drop',e=>{
      e.preventDefault(); activeGroupId=group.id;
      if(!dragPayload) return;
      if(dragPayload.type==='hand') {
        if(canDropHandCardIntoGroup(group)) addHandCardToSpecificGroup(dragPayload.cardUid,group.id);
      } else if(dragPayload.type==='table') moveTableCard(dragPayload.cardUid,dragPayload.fromGroupId,group.id);
      dragPayload=null; render();
    });
  }

  function addHandCardToSpecificGroup(cardUid,groupId) {
    const group=state.tableGroups.find(g=>g.id===groupId); if(!group) return;
    if(!canDropHandCardIntoGroup(group)) return;
    const p=state.players[0]; const idx=p.hand.findIndex(c=>c.uid===cardUid); if(idx<0)return;
    group.cards.push(p.hand.splice(idx,1)[0]); activeGroupId=groupId; render();
  }

  function renderHumanHand() {
    const p=state.players[0]; els.playerHand.innerHTML='';
    const humanTurn=canHumanManipulate();
    p.hand.forEach((card,index)=>{
      const node=cardElement(card);
      node.dataset.cardUid=card.uid;
      node.dataset.handIndex=String(index);
      // Układanie własnej ręki jest zawsze dozwolone — nie zmienia zasad ani stanu stołu.
      node.draggable=true;
      node.classList.add('hand-sortable');
      if(humanTurn && drawRequirementMet()) {
        node.classList.add('clickable');
        if(!state.turnSnapshot?.players[0].hand.some(c=>c.uid===card.uid)) node.classList.add('new-this-turn');
        node.addEventListener('click',e=>{ if(Date.now()<suppressClickUntil){ e.preventDefault(); return; } addHandCardToActive(card.uid); });
      }
      node.addEventListener('dragstart',e=>{
        dragPayload={type:'hand',cardUid:card.uid,fromHandIndex:index};
        node.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        // Firefox wymaga danych, aby DnD działało niezawodnie.
        try { e.dataTransfer.setData('text/plain',card.uid); } catch (_) {}
      });
      node.addEventListener('dragend',()=>{
        node.classList.remove('dragging');
        clearHandDropIndicator();
        dragPayload=null;
      });
      attachTouchDrag(node,()=>({type:'hand',cardUid:card.uid,fromHandIndex:Number(node.dataset.handIndex)}));
      els.playerHand.appendChild(node);
    });
    setupHandDropOnce();
  }

  function clearHandDropIndicator() {
    els.playerHand.querySelectorAll('.hand-insert-before,.hand-insert-after').forEach(n=>n.classList.remove('hand-insert-before','hand-insert-after'));
  }

  function handDropTarget(e) {
    const target=e.target.closest('.card[data-card-uid]');
    if(!target || target.dataset.cardUid===dragPayload?.cardUid) return {targetUid:null,after:true};
    const rect=target.getBoundingClientRect();
    return {targetUid:target.dataset.cardUid,after:e.clientX > rect.left + rect.width/2,target};
  }

  function reorderHandCard(cardUid,targetUid=null,after=true) {
    const hand=state?.players?.[0]?.hand;
    if(!hand) return false;
    const from=hand.findIndex(c=>c.uid===cardUid);
    if(from<0) return false;
    const [card]=hand.splice(from,1);
    let to=hand.length;
    if(targetUid) {
      const targetIndex=hand.findIndex(c=>c.uid===targetUid);
      if(targetIndex>=0) to=targetIndex+(after?1:0);
    }
    hand.splice(Math.max(0,Math.min(to,hand.length)),0,card);
    return true;
  }

  let handDropSetup=false;
  function setupHandDropOnce() {
    if(handDropSetup) return; handDropSetup=true;
    els.playerHand.addEventListener('dragover',e=>{
      if(!dragPayload) return;
      if(dragPayload.type==='table') {
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        els.playerHand.classList.add('drop-target');
        return;
      }
      if(dragPayload.type==='hand') {
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        els.playerHand.classList.add('drop-target','reordering');
        clearHandDropIndicator();
        const pos=handDropTarget(e);
        if(pos.target) pos.target.classList.add(pos.after?'hand-insert-after':'hand-insert-before');
      }
    });
    els.playerHand.addEventListener('dragleave',e=>{
      if(!els.playerHand.contains(e.relatedTarget)) {
        els.playerHand.classList.remove('drop-target','reordering');
        clearHandDropIndicator();
      }
    });
    els.playerHand.addEventListener('drop',e=>{
      e.preventDefault();
      els.playerHand.classList.remove('drop-target','reordering');
      if(dragPayload?.type==='table') {
        returnCardToHand(dragPayload.cardUid,dragPayload.fromGroupId);
      } else if(dragPayload?.type==='hand') {
        const pos=handDropTarget(e);
        if(reorderHandCard(dragPayload.cardUid,pos.targetUid,pos.after)) renderHumanHand();
      }
      clearHandDropIndicator();
      dragPayload=null;
    });
  }

  function attachTouchDrag(node,payloadFactory) {
    node.classList.add('touch-draggable');
    node.addEventListener('pointerdown',e=>{
      // Mysz korzysta z natywnego HTML5 DnD; ten tor jest dla palca/pióra.
      if(e.pointerType==='mouse' || (typeof e.button==='number' && e.button!==0) || touchDrag) return;
      const payload=payloadFactory();
      if(!payload) return;
      touchDrag={ pointerId:e.pointerId, node, payload, startX:e.clientX, startY:e.clientY, dragging:false, ghost:null, lastTarget:null };
      // Nie przechwytujemy pointera na elemencie. Na części mobilnych WebKitów
      // capture + elementFromPoint potrafiło zgubić prawdziwy cel upuszczenia.
    },{passive:true});
  }

  function handleGlobalPointerMove(e) {
    if(!touchDrag || touchDrag.pointerId!==e.pointerId) return;
    const dx=e.clientX-touchDrag.startX, dy=e.clientY-touchDrag.startY;
    if(!touchDrag.dragging && Math.hypot(dx,dy)>=7) startTouchDrag(e);
    if(!touchDrag.dragging) return;
    e.preventDefault();
    moveTouchGhost(e.clientX,e.clientY);
    autoScrollTouchZones(e.clientX,e.clientY);
    paintTouchDropTarget(e.clientX,e.clientY);
  }

  function handleGlobalPointerUp(e,cancelled=false) {
    if(!touchDrag || touchDrag.pointerId!==e.pointerId) return;
    finishTouchDrag(e,cancelled);
  }

  function startTouchDrag(e) {
    if(!touchDrag || touchDrag.dragging) return;
    touchDrag.dragging=true;
    dragPayload=touchDrag.payload;
    suppressClickUntil=Date.now()+500;
    touchDrag.node.classList.add('dragging');
    document.body.classList.add('touch-dragging');
    const rect=touchDrag.node.getBoundingClientRect();
    const ghost=touchDrag.node.cloneNode(true);
    ghost.classList.remove('dragging','hand-insert-before','hand-insert-after');
    ghost.classList.add('touch-drag-ghost');
    ghost.style.width=`${rect.width}px`;
    ghost.style.height=`${rect.height}px`;
    touchDrag.ghost=ghost;
    document.body.appendChild(ghost);
    moveTouchGhost(e.clientX,e.clientY);
  }

  function moveTouchGhost(x,y) {
    if(!touchDrag?.ghost) return;
    touchDrag.ghost.style.transform=`translate3d(${Math.round(x)}px,${Math.round(y)}px,0) translate(-50%,-55%) rotate(2deg)`;
  }

  function autoScrollTouchZones(x,y) {
    for(const zone of [els.playerHand,els.meldBoard]) {
      if(!zone || zone.scrollWidth<=zone.clientWidth+2) continue;
      const r=zone.getBoundingClientRect();
      if(y<r.top || y>r.bottom) continue;
      const edge=Math.min(54,Math.max(28,r.width*.12));
      if(x<r.left+edge) zone.scrollLeft-=18;
      else if(x>r.right-edge) zone.scrollLeft+=18;
    }
  }

  function clearTouchDropTargets() {
    document.querySelectorAll('.touch-drop-target').forEach(el=>el.classList.remove('touch-drop-target'));
    clearHandDropIndicator();
  }

  function elementBelowTouch(x,y) {
    if(touchDrag?.ghost) touchDrag.ghost.style.visibility='hidden';
    const el=document.elementFromPoint(x,y);
    if(touchDrag?.ghost) touchDrag.ghost.style.visibility='visible';
    return el;
  }

  function handDropTargetAt(x,y) {
    const below=elementBelowTouch(x,y);
    const target=below?.closest?.('.card[data-card-uid]');
    if(!target || target.dataset.cardUid===touchDrag?.payload?.cardUid) return {targetUid:null,after:true,target:null};
    const rect=target.getBoundingClientRect();
    return {targetUid:target.dataset.cardUid,after:x>rect.left+rect.width/2,target};
  }

  function paintTouchDropTarget(x,y) {
    clearTouchDropTargets();
    const below=elementBelowTouch(x,y);
    if(!below || !touchDrag) return;
    const groupEl=below.closest?.('.meld-group');
    const handEl=below.closest?.('#playerHand');
    if(groupEl) {
      const group=state.tableGroups.find(g=>g.id===groupEl.dataset.groupId);
      if(group && (touchDrag.payload.type==='table' || canDropHandCardIntoGroup(group))) groupEl.classList.add('touch-drop-target');
      return;
    }
    if(handEl) {
      handEl.classList.add('touch-drop-target');
      if(touchDrag.payload.type==='hand') {
        const pos=handDropTargetAt(x,y);
        if(pos.target) pos.target.classList.add(pos.after?'hand-insert-after':'hand-insert-before');
      }
    }
  }

  function finishTouchDrag(e,cancelled=false) {
    if(!touchDrag || touchDrag.pointerId!==e.pointerId) return;
    const td=touchDrag;
    if(td.dragging) {
      e.preventDefault();
      if(!cancelled) performTouchDrop(e.clientX,e.clientY,td.payload);
      suppressClickUntil=Date.now()+500;
    }
    td.node.classList.remove('dragging');
    td.ghost?.remove();
    document.body.classList.remove('touch-dragging');
    clearTouchDropTargets();
    dragPayload=null;
    touchDrag=null;
  }

  function performTouchDrop(x,y,payload) {
    const below=elementBelowTouch(x,y);
    if(!below || !payload) return;
    const groupEl=below.closest?.('.meld-group');
    const handEl=below.closest?.('#playerHand');
    if(groupEl) {
      const group=state.tableGroups.find(g=>g.id===groupEl.dataset.groupId);
      if(!group) return;
      activeGroupId=group.id;
      if(payload.type==='hand') {
        if(canDropHandCardIntoGroup(group)) addHandCardToSpecificGroup(payload.cardUid,group.id);
      } else if(payload.type==='table') {
        moveTableCard(payload.cardUid,payload.fromGroupId,group.id);
      }
      return;
    }
    if(handEl) {
      if(payload.type==='table') {
        returnCardToHand(payload.cardUid,payload.fromGroupId);
      } else if(payload.type==='hand') {
        const pos=handDropTargetAt(x,y);
        if(reorderHandCard(payload.cardUid,pos.targetUid,pos.after)) renderHumanHand();
      }
    }
  }

  function setEditorOpen(open) {
    els.rulesPanel.classList.toggle('collapsed',!open);
    els.toggleEditorBtn.setAttribute('aria-expanded',String(open));
    const mobile=window.matchMedia('(max-width:1050px)').matches;
    document.body.classList.toggle('editor-open',open && mobile);
  }

  function syncEditorViewportState() {
    const open=!els.rulesPanel.classList.contains('collapsed');
    document.body.classList.toggle('editor-open',open && window.matchMedia('(max-width:1050px)').matches);
  }

  function cardElement(card,jokerAssignment=null) {
    const div=document.createElement('div'); div.className='card';
    if(card.joker) {
      div.classList.add('joker'); div.innerHTML='<div class="corner">★</div><div class="center-suit">JOKER</div><div class="corner bottom">★</div>';
      if(jokerAssignment) { const b=document.createElement('div'); b.className='joker-resolution'; b.textContent=`=${jokerAssignment.aceLow?'A(1)':jokerAssignment.rank}${suitSymbol(jokerAssignment.suit)}`; div.appendChild(b); }
    } else {
      const suit=SUITS.find(s=>s.id===card.suit); if(suit.red) div.classList.add('red');
      div.innerHTML=`<div class="corner">${card.rank}<br>${suit.symbol}</div><div class="center-suit">${suit.symbol}</div><div class="corner bottom">${card.rank}<br>${suit.symbol}</div>`;
    }
    div.title=card.joker?'Joker':`${card.rank} ${suitName(card.suit)}`; return div;
  }

  function showRulesDialog() {
    const er=effectiveRules(); const round=state?.round ?? 1;
    els.rulesDialogSubtitle.textContent=`Preset „Układanka” · aktywne reguły rundy ${round}`;
    els.rulesHumanView.innerHTML=`
      <section class="rule-section"><h3>Przebieg tury</h3><ul>
        <li>Każdy gracz zaczyna z ${er.handSize} kartami i na początku swojej tury dobiera ${er.drawPerTurn} kartę/karty, o ile talia nie jest pusta.</li>
        <li>W czasie tury wolno wykonywać wiele zmian. Dopiero <strong>PROSZĘ →</strong> zatwierdza cały stan stołu.</li>
        <li>Po zatwierdzeniu nie może zostać żadna samotna karta ani niepełny układ.</li>
      </ul></section>
      <section class="rule-section"><h3>Legalne układy</h3><ul>
        <li><strong>Sekwens:</strong> minimum ${rules.meld.runMin} kolejnych kart jednego koloru.</li>
        <li><strong>Grupa:</strong> ${rules.meld.setMin}–4 karty tej samej rangi, ale każda w innym kolorze.</li>
        <li>Może istnieć kilka osobnych grup tej samej rangi, jeśli używamy wielu talii.</li>
        <li>Joker: ${rules.meld.jokerWild?'dzika karta zastępująca brakującą kartę':'nie jest dziki'}.</li>
      </ul></section>
      <section class="rule-section"><h3>As</h3><ul>
        <li>${er.aceLow?'A-2-3 jest legalne; As ma wtedy wartość 1.':'As nie może być przed 2.'}</li>
        <li>${er.aceHigh?`Q-K-A jest legalne; As ma wtedy wartość ${rules.cardModel.rankPoints.A}.`:'As nie może kończyć sekwensu po królu.'}</li>
        <li><strong>K-A-2 nie jest legalne</strong> — nie ma zawijania końca sekwensu na początek.</li>
      </ul></section>
      <section class="rule-section"><h3>Wejście i przebudowa stołu</h3><ul>
        <li>Pierwsze wyłożenie musi mieć łącznie co najmniej <strong>${er.entryMin} punktów</strong>${rules.meld.initialMeldOwnCardsOnly?' i powstaje wyłącznie z kart gracza':''}.</li>
        <li>Po wejściu ${rules.meld.allowRearrange?'można rozbierać i przebudowywać istniejące układy':'nie wolno przebudowywać istniejących układów'}.</li>
        <li>Każda karta, która była na stole przed turą, musi nadal znajdować się na stole po kliknięciu PROSZĘ.</li>
        <li>Joker ze stołu może zmienić miejsce, jeżeli po końcu tury wszystkie układy nadal są legalne.</li>
      </ul></section>
      <section class="rule-section"><h3>Wartości</h3><ul><li><code>${rules.cardModel.rankOrder.map(r=>`${r}:${rules.cardModel.rankPoints[r]}`).join(' · ')}</code></li><li>Wyjątek: niski As w sekwensie = 1.</li></ul></section>`;
    if(typeof els.rulesDialog.showModal==='function') els.rulesDialog.showModal(); else els.rulesDialog.setAttribute('open','');
  }

  function ruleSummary() { const er=effectiveRules(); return `7→${er.handSize} · dobierz ${er.drawPerTurn} · wejście ${er.entryMin}`; }
  function suitSymbol(id){return SUITS.find(s=>s.id===id)?.symbol ?? '';}
  function suitName(id){return SUITS.find(s=>s.id===id)?.name ?? '';}
  function suitIndex(id){return SUITS.findIndex(s=>s.id===id);}
  function clampInt(v,min,max){const n=parseInt(v,10);return Math.max(min,Math.min(max,Number.isFinite(n)?n:min));}
  function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function deepClone(v){return JSON.parse(JSON.stringify(v));}
  function setSelectValue(el,val){if([...el.options].some(o=>o.value===String(val)))el.value=String(val);}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function combinations(arr,k){const out=[];function rec(start,pick){if(pick.length===k){out.push([...pick]);return;}for(let i=start;i<=arr.length-(k-pick.length);i++){pick.push(arr[i]);rec(i+1,pick);pick.pop();}}rec(0,[]);return out;}
  function log(text){const div=document.createElement('div');div.className='log-line';div.textContent=`[${new Date().toLocaleTimeString()}] ${text}`;els.log.prepend(div);}
  function logClear(){els.log.innerHTML='';}
  function toast(text){els.toast.textContent=text;els.toast.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>els.toast.classList.remove('show'),2600);}

  els.applyRulesBtn.addEventListener('click',applyRules);
  els.newGameBtn.addEventListener('click',newGame);
  els.syncJsonBtn.addEventListener('click',syncJsonText);
  els.loadJsonBtn.addEventListener('click',loadJson);
  els.exportBtn.addEventListener('click',exportJson);
  els.addRoundRuleBtn.addEventListener('click',()=>addRoundRule());
  els.toggleEditorBtn.addEventListener('click',()=>setEditorOpen(els.rulesPanel.classList.contains('collapsed')));
  els.closeEditorInlineBtn.addEventListener('click',()=>setEditorOpen(false));
  els.showRulesBtn.addEventListener('click',showRulesDialog);
  els.activeRuleHint.addEventListener('click',showRulesDialog);
  els.closeRulesDialogBtn.addEventListener('click',()=>els.rulesDialog.close());
  els.deckPile.addEventListener('click',()=>drawCard(0));
  els.drawBtn.addEventListener('click',()=>drawCard(0));
  els.newGroupBtn.addEventListener('click',()=>createGroup(true));
  els.undoTurnBtn.addEventListener('click',undoTurn);
  els.endTurnBtn.addEventListener('click',()=>endTurn(0));
  els.discardHint.addEventListener('click',()=>{ if(els.discardHint.title) toast(els.discardHint.title); });
  window.addEventListener('resize',syncEditorViewportState);
  window.addEventListener('orientationchange',syncEditorViewportState);
  window.addEventListener('pointermove',handleGlobalPointerMove,{passive:false});
  window.addEventListener('pointerup',e=>handleGlobalPointerUp(e,false),{passive:false});
  window.addEventListener('pointercancel',e=>handleGlobalPointerUp(e,true),{passive:false});

  const formIds=['deckCount','jokersPerDeck','playerCount','handSize','totalRounds','botStyle','entryMin','drawPerTurn','runMin','setMin','aceLow','aceHigh','jokerWild','allowRearrange','initialMeldOwnCardsOnly'];
  for(const id of formIds) els[id].addEventListener('change',()=>{readFormIntoEditorModel();if(id==='totalRounds')renderRoundRulesEditor();syncJsonText();});

  // Mały interfejs diagnostyczny do przyszłych testów silnika.
  window.CardSandboxDebug={ build:BUILD_VERSION, analyzeGroup:(cards)=>analyzeGroup(cards), getRules:()=>deepClone(rules) };

  setEditorOpen(false);
  syncFormFromEditorModel(); rules=deepClone(editorModel); newGame();
})();
