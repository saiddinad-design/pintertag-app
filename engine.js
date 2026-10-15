(function(root){
 function conflicts(items,mode,purpose,style){let cost=0;const reasons=new Set();const grid=purpose==='grid';
  for(let i=0;i<items.length;i++){const p=items[i];for(const j of [i-1,grid?i-3:-1]){if(j<0||(grid&&j===i-1&&i%3===0))continue;const q=items[j];if(p.type!=='unknown'&&p.type===q.type){cost+=7;reasons.add('types')}if(p.accent&&q.accent){cost+=5;reasons.add('accent')}if(p.bw&&q.bw){cost+=4;reasons.add('bw')}}
   if(i&&Math.abs(p.light-items[i-1].light)<.15)cost+=style==='bold'?0:1;
  }
  if(grid)for(let i=0;i<items.length;i+=3){const row=items.slice(i,i+3);if(row.filter(p=>p.accent).length>1){cost+=5;reasons.add('accent')}if(row.length===3&&row.every(p=>p.type==='person')){cost+=mode==='brand'?4:1}if(mode==='brand'&&i>0&&!row.some(p=>['product','detail'].includes(p.type))){cost+=3;reasons.add('product')}}
  if(mode==='personal'&&items.filter(p=>p.type==='person').length>4){cost+=6;reasons.add('people')}
  if(items.filter(p=>p.type==='text').length>1){cost+=7;reasons.add('text')}
  return {cost,reasons:[...reasons]};
 }
 function arrange(photos,opts={}){const {mode='personal',purpose='grid',style='balanced',count=9}=opts;const included=photos.filter(p=>p.selected||p.locked);const locks=included.filter(p=>p.locked);const target=Math.min(included.length,Math.max(count,locks.length));const others=included.filter(p=>!p.locked).sort((a,b)=> (style==='calm'?a.accent-b.accent:style==='bold'?b.accent-a.accent:b.light-a.light));let best=[...locks,...others.slice(0,Math.max(0,target-locks.length))];let evalBest=conflicts(best,mode,purpose,style);let seed=41;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
  for(let k=0;k<1800;k++){let next=best.slice();const a=Math.floor(rand()*next.length),b=Math.floor(rand()*next.length);[next[a],next[b]]=[next[b],next[a]];if(k%5===0){const extras=included.filter(p=>!next.some(q=>q.id===p.id));if(extras.length&&!next[a]?.locked)next[a]=extras[Math.floor(rand()*extras.length)]}const val=conflicts(next,mode,purpose,style);if(val.cost<=evalBest.cost){best=next;evalBest=val}}
  if(purpose==='story')best=best.slice().sort((a,b)=>({place:0,person:1,product:2,detail:3,object:4,text:5,break:6,unknown:7}[a.type]??7)-({place:0,person:1,product:2,detail:3,object:4,text:5,break:6,unknown:7}[b.type]??7));
  return {items:best,...conflicts(best,mode,purpose,style),unknown:best.some(p=>p.type==='unknown')};
 }
 root.PTEngine={arrange,conflicts};if(typeof module!=='undefined')module.exports=root.PTEngine;
})(typeof window!=='undefined'?window:globalThis);
