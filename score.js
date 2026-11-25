/* grid score core: measures one photo and scores a 9-post grid. shared by the app (merge.js) and the web score page. runs on the device. */
(function(){
  const MC = document.createElement('canvas'); MC.width = MC.height = 48; const mx = MC.getContext('2d', { willReadFrequently: true });
  const XC = document.createElement('canvas'); XC.width = XC.height = 96; const xx = XC.getContext('2d', { willReadFrequently: true });
  /* nov 25: the models were calibrated with <img> elements, which Chrome shrinks with a smooth (mipmapped) filter. canvases and
     ImageBitmaps (full-size uploads, Instagram originals) are shrunk with a plain filter that aliases: the same photo read twice as
     "busy" and an Instagram grid scored 12 instead of ~60. so every source is shrunk step by step (never more than 2x per step),
     which reproduces the smooth filter whatever the source type or size (checked: same tile as <img>, bitmap or 3x canvas
     reads within ~5% of the calibration value). */
  const SA = document.createElement('canvas'), SB = document.createElement('canvas');
  function shrinkTo(img, size, ctx){
    let w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
    if (!w || !h){ ctx.clearRect(0,0,size,size); ctx.drawImage(img, 0, 0, size, size); return; }
    let src = img, flip = false;
    while (w > size * 2 || h > size * 2){ const nw = Math.max(size, Math.round(w / 2)), nh = Math.max(size, Math.round(h / 2)), c = flip ? SB : SA;
      c.width = nw; c.height = nh; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low'; x.drawImage(src, 0, 0, w, h, 0, 0, nw, nh); src = c; w = nw; h = nh; flip = !flip; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.clearRect(0,0,size,size); ctx.drawImage(src, 0, 0, w, h, 0, 0, size, size); }
  function measure(img){
    shrinkTo(img, 48, mx);
    const d = mx.getImageData(0,0,48,48).data, L = new Float32Array(48*48);
    let r=0,g=0,b=0,s=0,ls=0,ls2=0,vv=0;
    for (let i=0,p=0;i<d.length;i+=4,p++){ const R=d[i]/255,G=d[i+1]/255,B=d[i+2]/255; r+=R;g+=G;b+=B;
      const hi=Math.max(R,G,B), lo=Math.min(R,G,B); s+= hi ? (hi-lo)/hi : 0; if (hi>.25 && (hi-lo)/hi>.55) vv++; const l=.2126*R+.7152*G+.0722*B; L[p]=l; ls+=l; ls2+=l*l; }
    const n=48*48; r/=n; g/=n; b/=n; s/=n; const lum=ls/n, contrast=Math.sqrt(Math.max(0, ls2/n-lum*lum));
    let lap=0; for (let y=1;y<47;y++) for (let x=1;x<47;x++){ const i=y*48+x; lap+=Math.abs(4*L[i]-L[i-1]-L[i+1]-L[i-48]-L[i+48]); }
    /* v65: CIELAB stats, the features that separated curated grids from random mixes in our reference set */
    const lin = v => v > .04045 ? Math.pow((v+.055)/1.055, 2.4) : v/12.92, fl = t => t > .008856 ? Math.cbrt(t) : 7.787*t + 16/116;
    const Ls = new Float32Array(n), hist = [0,0,0,0,0,0,0,0]; let aS = 0, Lsum = 0, Ct = 0;
    for (let i=0,p=0;i<d.length;i+=4,p++){ const R=lin(d[i]/255),G=lin(d[i+1]/255),B=lin(d[i+2]/255);
      const X=(.4124*R+.3576*G+.1805*B)/.95047, Y=.2126*R+.7152*G+.0722*B, Z=(.0193*R+.1192*G+.9505*B)/1.08883;
      const fx=fl(X), fy=fl(Y), fz=fl(Z), L=116*fy-16, A=500*(fx-fy), Bb=200*(fy-fz), C=Math.hypot(A,Bb);
      Ls[p]=L; Lsum+=L; aS+=A; Ct+=C; const h=Math.floor((Math.atan2(Bb,A)+Math.PI)/(2*Math.PI)*8)%8; hist[h]+=C; }
    const sorted = Array.from(Ls).sort((x,y)=>x-y);
    /* v3 (nov 23): 96px detail map. flat = share of calm, empty surface; bwx = crushed black / blown white; txt = hard black-on-white strokes (captions, headlines, screenshots) */
    shrinkTo(img, 96, xx); const e = xx.getImageData(0,0,96,96).data, Y = new Float32Array(9216);
    for (let i=0,p=0;i<e.length;i+=4,p++) Y[p] = (.2126*e[i]+.7152*e[i+1]+.0722*e[i+2])/255;
    let fl0=0, bw0=0, tx0=0, nn=0; for (let y=1;y<95;y++) for (let x=1;x<95;x++){ const i=y*96+x, l=Math.abs(4*Y[i]-Y[i-1]-Y[i+1]-Y[i-96]-Y[i+96]); nn++; if (l<.015) fl0++; if (Y[i]<.06||Y[i]>.94) bw0++;
      if (l>.5){ const hi=Math.max(Y[i],Y[i-1],Y[i+1],Y[i-96],Y[i+96]), lo=Math.min(Y[i],Y[i-1],Y[i+1],Y[i-96],Y[i+96]); if (hi>.75 && lo<.3) tx0++; } }
    return { sat:s, lum, contrast, sharp: lap/(46*46), warm: r-b, vivid: vv/n, v:3, flat: fl0/nn, bwx: bw0/nn, txt: tx0/nn, L: Lsum/n, Lp95: sorted[Math.floor(n*.95)], a: aS/n, hist: hist.map(v => v/(Ct+1e-6)) };
  }
  /* v3 grid score (nov 23). recalibrated on 85 grids: 49 public accounts (fashion houses, retail, creators, celebrities, news,
     meme pages) measured the way a phone screenshot arrives, plus 36 real profile screenshots of menswear brands, jewellery
     houses, and male and female style creators. each grid was rated by eye on a 0-100 art-direction scale.
     the old score matched those ratings at r = 0.09 (meme and news pages got 90+); this one at r = 0.81 (0.78 leave-one-out,
     mean miss about 11 points). four signals drive the total, all measured on the device:
       palette - how many unrelated hue families the grid uses (entropy) and how loud the colour is overall
       calm    - visual clutter: fine detail, text overlays, busy collages (edge energy) plus crushed black / blown white areas
     rhythm (spread of quiet vs busy frames) is reported but no longer moves the total: it did not hold up on the new screenshots.
     known limits: dark, cohesive grids (all-black, deep brown) land ~15-20 under an art director's eye; text written over photos is only partly caught. */
  const sdv = a => { const m = a.reduce((t,v)=>t+v,0)/a.length; return Math.sqrt(a.reduce((t,v)=>t+(v-m)**2,0)/a.length); };
  const hd = (x,y) => x.hist.reduce((t,v,k)=>t+Math.abs(v-y.hist[k]),0);
  const MU = { ent: .644, bwx: .1307, sat: .2685, sharp: .1229 }, SD = { ent: .1361, bwx: .1012, sat: .0939, sharp: .0309 };
  const W = { ent: -8.549, bwx: -4.827, sat: -6.104, sharp: -11.515 }, B0 = 62.776, CAL = [-2.21, 1.0352];
  const sig = z => Math.round(100 / (1 + Math.exp(1.1 * z)));
  function scoreGrid(ms){ const c = ms.filter(m => m && m.v >= 2 && m.hist); if (c.length < 2) return null;
    const P = [0,0,0,0,0,0,0,0]; let tot = 1e-6; c.forEach(m => m.hist.forEach((v,k) => { P[k] += v*m.sat; tot += v*m.sat; }));
    const ent = -P.map(v => v/tot).filter(v => v > 0).reduce((t,q) => t + q*Math.log(q), 0) / Math.log(8);
    const avg = k => c.reduce((t,m)=>t+m[k],0)/c.length, has = k => c.every(m => m[k] != null), Lsd = sdv(c.map(m=>m.L));
    const flatsd = has('flat') ? sdv(c.map(m => m.flat)) : .133, f = { ent, bwx: has('bwx') ? avg('bwx') : MU.bwx, sat: avg('sat'), sharp: avg('sharp') };
    const z = {}; for (const k in W) z[k] = (f[k] - MU[k]) / SD[k];
    const raw = B0 + Object.keys(W).reduce((t,k) => t + W[k]*z[k], 0), total = Math.round(Math.max(12, Math.min(97, CAL[0] + CAL[1]*raw)));
    const near = (x,y) => hd(x,y) + Math.abs(x.L-y.L)/25; let nb = 0, nn = 0, all = 0, an = 0;
    for (let i=0;i<c.length;i++){ if (i%3<2 && c[i+1]){ nb += near(c[i],c[i+1]); nn++; } if (c[i+3]){ nb += near(c[i],c[i+3]); nn++; } for (let j=i+1;j<c.length;j++){ all += near(c[i],c[j]); an++; } }
    const ratio = nn && all ? (nb/nn)/(all/an) : 1;
    const palette = sig((z.ent + z.sat) / 2), clean = sig((1.6*z.sharp + z.bwx) / 2.6), rhythmScore = sig(-(flatsd - .133) / .044);
    return { total, palette, clean, rhythmScore, tone: palette/100, light: Math.max(0, 1 - Lsd/30), rhythm: Math.max(0, Math.min(1, ratio/1.3)), lsd: Lsd, v: 3 }; }
  window.PTScore = { measure, scoreGrid, hd, sdv };
})();
