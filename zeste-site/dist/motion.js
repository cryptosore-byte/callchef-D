/* Zeste motion direction v2 — one rAF loop, IntersectionObserver-gated, no dependencies.
   Every hidden/initial state lives under html.motion-ready, so pausing (or a script failure)
   always leaves the page fully readable. */
(()=>{
  const doc=document.documentElement, body=document.body;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
  const allowed=()=>!reduced.matches&&!body.classList.contains('motion-paused');
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const ease=t=>1-Math.pow(1-t,4);
  const canWAAPI=typeof Element.prototype.animate==='function';
  const hasIO='IntersectionObserver' in window;
  const animations=[];

  // Content from app.js reveal is handled here instead, to avoid stacking two transforms.
  $$('.reveal-pending').forEach(el=>el.classList.remove('reveal-pending'));

  /* ---------- Markup preparation (purely additive, text stays intact) ---------- */
  function splitWords(el,wrap){
    let i=0;
    const walk=node=>{
      [...node.childNodes].forEach(child=>{
        if(child.nodeType===3){
          const frag=document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part=>{
            if(!part)return;
            if(/^\s+$/.test(part)){frag.append(part);return;}
            frag.append(wrap(part,i++));
          });
          child.replaceWith(frag);
        }else if(child.nodeType===1&&child.tagName!=='BR'&&child.tagName!=='SVG'){walk(child);}
      });
    };
    walk(el);return i;
  }
  const maskWord=(text,i)=>{const w=document.createElement('span');w.className='w';const s=document.createElement('span');s.textContent=text;s.style.setProperty('--i',i);w.append(s);return w;};
  const fillWord=(text,i)=>{const s=document.createElement('span');s.className='fw';s.textContent=text;return s;};

  const titles=$$('.hero h1,.section-head h2,.agency-copy h2,.contact h2');
  titles.forEach(t=>{splitWords(t,maskWord);t.classList.add('split');});

  const fills=$$('.section-head>p,.agency-copy>p:not(.eyebrow),.contact>div>p:not(.eyebrow)').map(p=>{
    splitWords(p,fillWord);p.classList.add('fill');return {el:p,words:$$('.fw',p),lit:-1};
  });

  // Decorative crossing band behind the ticker.
  const band=$('.motion-band'), ticker=$('.ticker',band);
  const cross=ticker.cloneNode(true);cross.classList.add('ticker-cross');cross.setAttribute('aria-hidden','true');
  band.insertBefore(cross,ticker);

  // Giant footer wordmark, letters rise as the page ends.
  const heroMark=$('.hero-wordmark');
  const giant=document.createElement('div');giant.className='footer-giant';giant.setAttribute('aria-hidden','true');
  const giantSvg=heroMark.cloneNode(true);giantSvg.removeAttribute('role');giantSvg.removeAttribute('aria-label');giantSvg.setAttribute('class','footer-giant-mark');
  $$('path',giantSvg).forEach((p,i)=>p.style.setProperty('--i',i));
  giant.append(giantSvg);$('footer').append(giant);

  // Generic reveal targets.
  const mark=(sel,type)=>$$(sel).forEach((el,i,all)=>{el.dataset.reveal=type;el.style.setProperty('--i',i%4);});
  mark('.approach-trio p','flip');
  mark('.chart-card','rise');
  mark('.pricing-grid>article','rise');
  mark('.platforms>div>span','pop');
  mark('.initials span','pop');
  mark('.savings-strip,.compact-faq details,.pricing-note,.demo-label','up');
  mark('.contact form>*','up');
  $$('.contact form>*').forEach((el,i)=>el.style.setProperty('--i',Math.min(i,10)));
  $$('.donut-wrap circle').forEach((c,i)=>{c.style.setProperty('--d',c.getAttribute('stroke-dasharray'));c.style.setProperty('--i',i);});
  $$('.line-chart polyline').forEach((l,i)=>l.style.setProperty('--i',i));
  const chartDots=$$('.line-chart g[fill] circle');

  /* ---------- Mode switching ---------- */
  function applyMode(){
    const on=allowed();
    doc.classList.toggle('motion-ready',on);
    if(!on){
      animations.forEach(a=>{try{a.finish();}catch(e){}});
      const intro=$('.zeste-intro');if(intro)intro.remove();
      doc.classList.remove('intro-lock');
      $$('.magnetic').forEach(el=>el.style.removeProperty('translate'));
    }
  }
  applyMode();
  new MutationObserver(applyMode).observe(body,{attributes:true,attributeFilter:['class']});
  reduced.addEventListener('change',applyMode);

  /* ---------- Intro curtain + hero choreography ---------- */
  const hero=$('.hero');
  function heroIn(){
    hero.classList.add('in');
    $('.hero h1').classList.add('in');
    if(!allowed()||!canWAAPI)return;
    // Letters land one by one. The glyph group is y-flipped, so +Y in letter space is "up" on screen.
    const letters=$$('path',heroMark);
    letters.forEach((letter,i)=>animations.push(letter.animate([
      {transform:'translateY(140%) rotate(-14deg) scaleY(1.3)',opacity:0},
      {transform:'translateY(-6%) rotate(2deg) scaleY(.84) scaleX(1.08)',opacity:1,offset:.62},
      {transform:'translateY(3%) scaleY(1.04) scaleX(.98)',offset:.82},
      {transform:'none',opacity:1}
    ],{duration:760,delay:110*i,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'})));
    if(scrollY<innerHeight*.5)setTimeout(()=>deliveryRide(letters,4),110*(letters.length-1)+700);
  }

  /* ---------- The "e" rides an S-shaped delivery run ----------
     Route: hop out to the right, curl into a true S (top stroke leftwards, left bowl, middle stroke
     through the restaurant, right bowl, bottom stroke), then home along the bottom and the left margin.
     The trail is a comet: its tail starts erasing mid-run and vanishes into the parked letter. */
  function deliveryRide(letters,index){
    const letter=letters[index];
    if(!letter||!allowed()||!canWAAPI)return;
    const NS='http://www.w3.org/2000/svg';
    const mk=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);return n;};
    const copy=$('.hero-copy'),base=copy.getBoundingClientRect(),r=letter.getBoundingClientRect();
    const sx=r.left-base.left+r.width/2,sy=r.top-base.top+r.height/2,w=r.width,h=r.height;
    const eng=$('.engine-center').getBoundingClientRect(),sig=$('.hero-signature').getBoundingClientRect();
    const wide=innerWidth>760&&eng.top>0&&eng.bottom<innerHeight;
    const gx=-Math.min(base.left*.5,60)+(wide?0:4);
    let cx,cy,half,a,low;
    if(wide){
      // The S spans the whole art column, from the copy's edge to the right margin.
      const art=$('.hero-art').getBoundingClientRect();
      const leftX=Math.max(base.width+10,art.left-base.left),rightX=Math.min(art.right,innerWidth-24)-base.left-20;
      cx=(leftX+rightX)/2;half=(rightX-leftX)/2;
      const top=eng.top-base.top-eng.height*.22,bottom=eng.bottom-base.top+eng.height*.22;
      cy=(top+bottom)/2;a=(bottom-top)/2;
      low=Math.min(sig.bottom-base.top+34,innerHeight-base.top-26);
    }else{
      cx=base.width*.5;half=base.width*.44;a=h*1.55;cy=sy+h*.75+a;
      low=cy+a+h*.55;
    }
    const k=1.3333,b=a/2;                          // each bowl is a half-ellipse of height a, width b
    const xl=cx-half+b,xr=cx+half-b;              // where the straight strokes meet the bowls
    const y1=cy-a,y3=cy+a,y0=y1-a*.4,curl=a*.2,xt=xr+b*.35;
    const legs=[
      `M${sx} ${sy}C${sx+w*1.3} ${sy} ${xt-a*1.2} ${y0} ${xt} ${y0}`,                 // hop out
      `C${xt+curl*k} ${y0} ${xt+curl*k} ${y1} ${xt} ${y1}L${xl} ${y1}`,               // curl + top stroke
      `C${xl-b*k} ${y1} ${xl-b*k} ${cy} ${xl} ${cy}`,                                  // left bowl
      `L${xr} ${cy}`,                                                                   // middle stroke (pickup)
      `C${xr+b*k} ${cy} ${xr+b*k} ${y3} ${xr} ${y3}`,                                  // right bowl
      `C${xr-a*1.4} ${y3} ${Math.max(gx+w*3,xl-a)} ${low} ${Math.max(gx+w*1.5,xl-a*1.6)} ${low}`, // bottom stroke, easing down
      `C${gx+w*.2} ${low} ${gx} ${low} ${gx} ${low-h*.9}L${gx} ${sy+h*.9}C${gx} ${sy+h*.2} ${gx+w*.25} ${sy} ${gx+w*1.1} ${sy}L${sx} ${sy}` // home
    ];
    const svg=mk('svg',{class:'ride','aria-hidden':'true',width:'1',height:'1'});
    const trail=mk('path',{class:'ride-trail','stroke-width':clamp(h*.085,3.5,8).toFixed(1)});
    const puffs=mk('g',{});
    const bb=letter.getBBox();
    const rider=mk('g',{class:'ride-rider'}),lean=mk('g',{});
    const glyph=mk('svg',{viewBox:`${bb.x} ${-bb.y-bb.height} ${bb.width} ${bb.height}`,x:-w/2,y:-h/2,width:w,height:h,overflow:'visible'});
    const flip=mk('g',{transform:'scale(1,-1)'});const clone=letter.cloneNode(true);clone.removeAttribute('style');flip.append(clone);glyph.append(flip);
    const box=mk('rect',{class:'ride-box',x:-w*.27,y:-h*.5-w*.5,width:w*.54,height:w*.44,rx:w*.08});
    lean.append(box,glyph);rider.append(lean);svg.append(trail,puffs,rider);copy.append(svg);
    const cum=[];let d='';legs.forEach(l=>{d+=l;trail.setAttribute('d',d);cum.push(trail.getTotalLength());});
    const L=cum[cum.length-1],pickAt=(cum[2]+cum[3])/2,dropAt=cum[4]+(cum[5]-cum[4])*.55;
    trail.style.strokeDasharray=`0 ${L+10}`;
    letter.style.opacity='0';

    const D=wide?3400:2800,TAIL0=.46,TAILD=.72;  // tail starts erasing at 46% and lands just after the rider parks
    const sine=t=>.5-.5*Math.cos(Math.PI*clamp(t));
    const look=Math.max(10,w*.35);
    let angle=null,face=1,last=performance.now(),lastPuff=0,picked=false,dropped=false,parked=false,prevDist=0;
    const t0=last;
    const finish=()=>{svg.remove();letter.style.removeProperty('opacity');};
    function pop(label,x,y){
      const tag=document.createElement('span');tag.className='ride-tag';tag.textContent=label;tag.setAttribute('aria-hidden','true');
      tag.style.left=x+'px';tag.style.top=y+'px';copy.append(tag);
      tag.animate([{opacity:0,transform:'translate(-50%,0) scale(.6)'},{opacity:1,transform:'translate(-50%,-34px) scale(1)',offset:.22},{opacity:1,transform:'translate(-50%,-44px)',offset:.72},{opacity:0,transform:'translate(-50%,-64px)'}],{duration:1300,easing:'cubic-bezier(.16,1,.3,1)'}).finished.then(()=>tag.remove(),()=>tag.remove());
    }
    function step(now){
      if(!allowed()){finish();return;}
      const dt=Math.min(50,now-last)||16;last=now;
      const t=(now-t0)/D,dist=sine(t)*L,tail=sine((t-TAIL0)/TAILD)*L;
      trail.style.strokeDasharray=`0 ${tail.toFixed(1)} ${Math.max(0,dist-tail).toFixed(1)} ${L+10}`;
      if(!parked){
        const p=trail.getPointAtLength(dist),q=trail.getPointAtLength(Math.min(L,dist+look)),o=trail.getPointAtLength(Math.max(0,dist-look));
        const dx=q.x-o.x,dy=q.y-o.y;
        // Critically damped turning: frame-rate independent smoothing.
        const turn=1-Math.exp(-dt/70),flipK=1-Math.exp(-dt/110);
        const targetFace=t>.97?1:dx<-1?-1:dx>1?1:face>0?1:-1;
        face+=(targetFace-face)*flipK;
        const target=t>.97?0:clamp(Math.atan2(dy,Math.abs(dx))*180/Math.PI*(targetFace),-62,62);
        angle=angle===null?target:angle+(target-angle)*turn;
        const speed=clamp((dist-prevDist)/dt/1.4);prevDist=dist;
        const sxk=1+speed*.16,syk=1-speed*.07;
        rider.setAttribute('transform',`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(2)})`);
        lean.setAttribute('transform',`scale(${(face*sxk).toFixed(3)} ${syk.toFixed(3)})`);
        if(now-lastPuff>55&&t>.04&&t<.94){
          lastPuff=now;const back=trail.getPointAtLength(Math.max(0,dist-w*.5));
          const c=mk('circle',{class:'ride-puff',cx:back.x.toFixed(1),cy:(back.y+h*.28).toFixed(1),r:(1.8+Math.random()*3).toFixed(1)});puffs.append(c);
          c.animate([{opacity:.85,transform:'scale(1)'},{opacity:0,transform:`translate(${(-dx/look*14).toFixed(1)}px,${(-dy/look*14-6).toFixed(1)}px) scale(2.4)`}],{duration:560,easing:'cubic-bezier(.16,1,.3,1)'}).finished.then(()=>c.remove(),()=>c.remove());
        }
        if(!picked&&dist>=pickAt){
          picked=true;rider.classList.add('loaded');
          if(wide)$('.engine-center').animate([{scale:1},{scale:1.07},{scale:1}],{duration:480,easing:'cubic-bezier(.34,1.56,.64,1)'});
          dispatchEvent(new CustomEvent('zeste:pickup'));
        }
        if(!dropped&&dist>=dropAt){dropped=true;rider.classList.remove('loaded');pop('+1 commande ↗\ufe0e',p.x,p.y-h*.55);}
        if(t>=1){
          parked=true;rider.remove();letter.style.removeProperty('opacity');
          letter.animate([{transform:'scaleY(.86) scaleX(1.07)'},{transform:'scaleY(1.05) scaleX(.98)',offset:.5},{transform:'none'}],{duration:420,easing:'cubic-bezier(.33,1,.68,1)'});
          letters.forEach((l,i)=>{if(l!==letter)l.animate([{transform:'none'},{transform:'translateY(6%)'},{transform:'none'}],{duration:420,delay:Math.abs(i-index)*45,easing:'cubic-bezier(.45,0,.55,1)'});});
        }
      }
      if(t<TAIL0+TAILD)requestAnimationFrame(step);else finish();
    }
    requestAnimationFrame(step);
  }

  let seen=false;try{seen=sessionStorage.getItem('zeste-intro')==='1';}catch(e){}
  if(allowed()&&canWAAPI&&!seen){
    try{sessionStorage.setItem('zeste-intro','1');}catch(e){}
    const intro=document.createElement('div');intro.className='zeste-intro';intro.setAttribute('aria-hidden','true');
    intro.innerHTML='<div class="intro-inner"><div class="intro-meta"><span>WE TURN DELIVERY INTO PROFIT.</span><b class="intro-count">0 %</b></div><i class="intro-bar"></i></div>';
    body.append(intro);doc.classList.add('intro-lock');
    const count=$('.intro-count',intro),bar=$('.intro-bar',intro),t0=performance.now();
    (function tick(now){const t=clamp((now-t0)/800);count.textContent=Math.round(ease(t)*100)+' %';bar.style.transform='scaleX('+ease(t)+')';if(t<1&&intro.isConnected)requestAnimationFrame(tick);})(t0);
    // The curtain lifts with a curved, melting edge while the hero settles underneath.
    const lift={duration:1000,delay:850,easing:'cubic-bezier(.7,0,.2,1)',fill:'forwards'};
    const exit=intro.animate([{transform:'translateY(0)',borderBottomLeftRadius:'0 0',borderBottomRightRadius:'0 0'},{transform:'translateY(-100%)',borderBottomLeftRadius:'50% 22vh',borderBottomRightRadius:'50% 22vh',offset:.7},{transform:'translateY(-118%)',borderBottomLeftRadius:'50% 30vh',borderBottomRightRadius:'50% 30vh'}],lift);
    $('.intro-inner',intro).animate([{transform:'none',opacity:1},{transform:'translateY(-30vh)',opacity:0}],{...lift,duration:700});
    hero.animate([{transform:'translateY(12vh) scale(.96)',filter:'blur(6px)'},{transform:'none',filter:'blur(0)'}],{duration:1300,delay:850,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
    setTimeout(heroIn,1050);
    const done=()=>{intro.remove();doc.classList.remove('intro-lock');};
    exit.finished.then(done,done);setTimeout(done,2600);
  }else{heroIn();}

  /* ---------- Reveal on enter ---------- */
  const scrambleChars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789€%◆';
  function scramble(el){
    if(el.dataset.scrambled||!allowed())return;el.dataset.scrambled='1';
    const original=el.textContent,len=original.length,t0=performance.now(),dur=750;
    el.setAttribute('aria-label',original);
    (function frame(now){
      const t=clamp((now-t0)/dur),fixed=Math.floor(ease(t)*len);
      let out='';for(let i=0;i<len;i++){const c=original[i];out+=i<fixed||c===' '?c:scrambleChars[(Math.random()*scrambleChars.length)|0];}
      el.textContent=out;
      if(t<1&&allowed())requestAnimationFrame(frame);else{el.textContent=original;el.removeAttribute('aria-label');}
    })(t0);
  }
  function countUp(node,target,suffix,dur){
    if(!allowed()){node.textContent=target+suffix;return;}
    const t0=performance.now();
    (function frame(now){const t=clamp((now-t0)/dur);node.textContent=Math.round(ease(t)*target)+suffix;if(t<1&&allowed())requestAnimationFrame(frame);else node.textContent=target+suffix;})(t0);
  }
  function onReveal(el){
    el.classList.add('in');
    if(el.dataset.reveal)setTimeout(()=>el.classList.add('settled'),2000);
    if(el.matches('.section-head')){const eb=$('.eyebrow',el);if(eb)scramble(eb);}
    if(el.matches('.price-card')){
      const amount=$('.price-amount',el),text=amount&&amount.firstChild;
      if(text&&text.nodeType===3){const n=parseInt(text.textContent,10);if(n)countUp(text,n,' ',1400);}
    }
    if(el.matches('.chart-card')){
      const t=$('.donut-wrap svg text',el);if(t)countUp(t,18,' %',1600);
    }
  }
  const revealTargets=[...titles.filter(t=>!t.closest('.hero')),...$$('[data-reveal]'),...$$('.section-head')];
  if(hasIO){
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){onReveal(e.target);io.unobserve(e.target);}}),{threshold:.15,rootMargin:'0px 0px -6% 0px'});
    revealTargets.forEach(el=>io.observe(el));
  }else revealTargets.forEach(onReveal);

  /* ---------- Scroll-linked scenes ---------- */
  const vh=()=>innerHeight;
  const scenes=[
    {el:hero,run(r){const q=clamp(-r.top/(r.height*.9));hero.style.setProperty('--hx',q.toFixed(4));}},
    ...$$('.agency,.performance,.contact').map(el=>({el,run(r){el.style.setProperty('--enter',ease(clamp((vh()-r.top)/(vh()*.75))).toFixed(4));}})),
    {el:$('.agency'),run(r){const p=clamp((vh()-r.top)/(vh()+r.height));$('.card-stage').style.setProperty('--card-scroll',p.toFixed(4));}},
    {el:$('.line-chart'),run(r){
      const d=clamp((vh()*.92-r.top)/(vh()*.55));$('.line-chart').style.setProperty('--draw',d.toFixed(4));
      chartDots.forEach((dot,i)=>dot.classList.toggle('on',d>=i/(chartDots.length-1)-.001&&d>0));
    }},
    {el:$('.contact'),run(r){const p=clamp((vh()-r.top)/(vh()+r.height));const s=$('.contact-spark');if(s)s.style.setProperty('--spin',(p*540).toFixed(1)+'deg');}},
    {el:$('footer'),run(r){$('footer').style.setProperty('--enter',clamp((vh()-r.top)/(r.height*.95)).toFixed(4));}},
    ...fills.map(f=>({el:f.el,run(r){
      const p=clamp((vh()*.88-r.top)/(vh()*.5)),lit=Math.round(p*f.words.length);
      if(lit!==f.lit){f.words.forEach((w,i)=>w.classList.toggle('lit',i<lit));f.lit=lit;}
    }}))
  ];
  const active=new Set(hasIO?[]:scenes);
  if(hasIO){
    const sio=new IntersectionObserver(entries=>entries.forEach(e=>{const s=scenes.filter(x=>x.el===e.target);s.forEach(x=>e.isIntersecting?active.add(x):active.delete(x));}),{rootMargin:'20% 0px 20% 0px'});
    [...new Set(scenes.map(s=>s.el))].forEach(el=>sio.observe(el));
  }

  /* ---------- Velocity ticker ---------- */
  const tracks=[{el:$('.ticker-track',ticker),dir:1,x:0},{el:$('.ticker-track',cross),dir:-1,x:0}];
  let tickerVisible=true,lastY=scrollY,velocity=0,lastT=performance.now();
  if(hasIO)new IntersectionObserver(e=>{tickerVisible=e[0].isIntersecting;}).observe(band);

  /* ---------- Cursor + magnetic + spotlight ---------- */
  const cursor=document.createElement('div');cursor.className='cursor';cursor.setAttribute('aria-hidden','true');cursor.innerHTML='<i></i><span></span>';
  body.append(cursor);
  const ptr={x:innerWidth/2,y:innerHeight/2,rx:innerWidth/2,ry:innerHeight/2,moved:false};
  addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;ptr.x=e.clientX;ptr.y=e.clientY;
    if(!ptr.moved){ptr.moved=true;ptr.rx=ptr.x;ptr.ry=ptr.y;cursor.classList.add('on');}
  },{passive:true});
  document.addEventListener('pointerleave',()=>cursor.classList.remove('on'));
  document.addEventListener('pointerenter',()=>{if(ptr.moved)cursor.classList.add('on');});
  const hoverSel='a,button,summary,select,input,textarea,label,[role=tab]';
  document.addEventListener('pointerover',e=>{
    const t=e.target.closest(hoverSel);cursor.classList.toggle('hover',!!t);
    cursor.classList.toggle('text',!!e.target.closest('input,textarea'));
  });
  document.addEventListener('pointerdown',()=>cursor.classList.add('down'));
  document.addEventListener('pointerup',()=>cursor.classList.remove('down'));

  $$('.button,.motion-control,header nav a').forEach(el=>{
    el.classList.add('magnetic');
    const pull=el.matches('.button')?.32:.22;
    el.addEventListener('pointermove',e=>{
      if(!allowed()||e.pointerType!=='mouse')return;
      const r=el.getBoundingClientRect();
      el.style.translate=((e.clientX-r.left-r.width/2)*pull).toFixed(1)+'px '+((e.clientY-r.top-r.height/2)*pull*1.2).toFixed(1)+'px';
    });
    el.addEventListener('pointerleave',()=>el.style.removeProperty('translate'));
  });
  $$('.price-card,.chart-card,.approach-trio p').forEach(el=>el.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;const r=el.getBoundingClientRect();
    el.style.setProperty('--sx',(e.clientX-r.left)+'px');el.style.setProperty('--sy',(e.clientY-r.top)+'px');
  }));

  /* Tilt with depth: the engine rotates and the chips drift on separate planes. */
  function tilt(surface,target,prefix,amount,layers){
    let pending=0,px=0,py=0;
    surface.addEventListener('pointermove',event=>{
      if(!allowed()||event.pointerType!=='mouse')return;
      const box=surface.getBoundingClientRect();px=(event.clientX-box.left)/box.width-.5;py=(event.clientY-box.top)/box.height-.5;
      if(pending)return;
      pending=requestAnimationFrame(()=>{
        target.style.setProperty('--'+prefix+'-x',(-py*amount)+'deg');target.style.setProperty('--'+prefix+'-y',(px*amount)+'deg');target.style.setProperty('--glint',((px+.5)*100)+'%');
        (layers||[]).forEach(([el,depth])=>{el.style.setProperty('--px',(px*depth).toFixed(1)+'px');el.style.setProperty('--py',(py*depth).toFixed(1)+'px');});
        pending=0;
      });
    });
    surface.addEventListener('pointerleave',()=>{
      if(pending)cancelAnimationFrame(pending);pending=0;
      ['-x','-y'].forEach(s=>target.style.removeProperty('--'+prefix+s));target.style.removeProperty('--glint');
      (layers||[]).forEach(([el])=>{el.style.removeProperty('--px');el.style.removeProperty('--py');});
    });
  }
  tilt($('.hero-art'),$('.engine'),'engine',14,[[$('.chip-menu'),-60],[$('.chip-margin'),70],[$('.chip-ops'),-40],[$('.engine-center'),18],[$('.engine-caption'),-30]]);
  tilt($('.agency-visual'),$('.card-stage'),'card',25);

  /* ---------- The single frame loop ---------- */
  function frame(now){
    requestAnimationFrame(frame);
    if(!allowed()||document.hidden){lastT=now;lastY=scrollY;return;}
    const dt=Math.min(64,now-lastT)||16;lastT=now;
    const dy=scrollY-lastY;lastY=scrollY;
    velocity+=((dy/dt)-velocity)*.12;
    active.forEach(s=>s.run(s.el.getBoundingClientRect()));
    if(tickerVisible){
      const boost=Math.min(6,Math.abs(velocity)*1.6),dir=velocity<-.05?-1:1;
      tracks.forEach(t=>{
        const half=t.el.scrollWidth/2||1;
        t.x-=(.045+boost*.18)*dt*t.dir*dir;
        if(t.x<=-half)t.x+=half;if(t.x>0)t.x-=half;
        t.el.style.transform='translate3d('+t.x.toFixed(1)+'px,0,0) skewX('+clamp(-velocity*4,-14,14).toFixed(2)+'deg)';
      });
    }
    if(ptr.moved&&finePointer.matches){
      ptr.rx+=(ptr.x-ptr.rx)*.18;ptr.ry+=(ptr.y-ptr.ry)*.18;
      cursor.style.setProperty('--x',ptr.x+'px');cursor.style.setProperty('--y',ptr.y+'px');
      cursor.style.setProperty('--rx',ptr.rx.toFixed(1)+'px');cursor.style.setProperty('--ry',ptr.ry.toFixed(1)+'px');
    }
  }
  requestAnimationFrame(frame);
})();
