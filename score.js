/* grid score core: measures one photo and scores a 9-post grid. shared by the app (merge.js) and the web score page. runs on the device. */
(function(){
  const MC = document.createElement('canvas'); MC.width = MC.height = 48; const mx = MC.getContext('2d', { willReadFrequently: true });
  function measure(img){
    mx.clearRect(0,0,48,48); mx.drawImage(img, 0, 0, 48, 48);
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
    return { sat:s, lum, contrast, sharp: lap/(46*46), warm: r-b, vivid: vv/n, v:2, L: Lsum/n, Lp95: sorted[Math.floor(n*.95)], a: aS/n, hist: hist.map(v => v/(Ct+1e-6)) };
  }
  /* v65 grid score, fitted on 48 reference grids (curated personal + brand accounts) against random 9-photo mixes.
     what curated grids share: steady overall brightness, steady highlights, a narrow colour family. order matters only a little:
     neighbours tend to differ slightly more than chance, so a small bonus for not parking look-alikes side by side. */
  const MODEL = { mu: [15.254, 13.358, 1.11, 2.555], sd: [3.711, 4.51, .185, 1.294], w: [-.55, -.42, -.27, -.29], b: -.4 };
  const sdv = a => { const m = a.reduce((t,v)=>t+v,0)/a.length; return Math.sqrt(a.reduce((t,v)=>t+(v-m)**2,0)/a.length); };
  const hd = (x,y) => x.hist.reduce((t,v,k)=>t+Math.abs(v-y.hist[k]),0);
  function scoreGrid(ms){ const c = ms.filter(m => m && m.v === 2); if (c.length < 2) return null;
    /* v2 (nov): curated grids keep a restrained palette. neutrals (black, white, grey, beige) do not count as colour, one accent hue is fine;
       what drops the score is many unrelated hues/filters and big jumps in light. strong black/white contrast is only lightly penalised. */
    const P = [0,0,0,0,0,0,0,0]; let tot = 1e-6; c.forEach(m => m.hist.forEach((v,k) => { P[k] += v*m.sat; tot += v*m.sat; }));
    let conc = 0; for (let k=0;k<8;k++) conc = Math.max(conc, P[k] + P[(k+1)%8]); conc /= tot;
    const msat = c.reduce((t,m)=>t+m.sat,0)/c.length, D = (1-conc)*msat, Lsd = sdv(c.map(m=>m.L)), P95 = sdv(c.map(m=>m.Lp95)), x = Math.max(0, Lsd-12);
    const raw = 97 - (1.6*x + .08*x*x) - Math.max(0, D-.03)*100 - .4*Math.max(0, P95-9), logit = (raw-78)/13, f = [Lsd];
    const near = (x,y) => hd(x,y) + Math.abs(x.L-y.L)/25; let nb = 0, nn = 0, all = 0, an = 0;
    for (let i=0;i<c.length;i++){ if (i%3<2 && c[i+1]){ nb += near(c[i],c[i+1]); nn++; } if (c[i+3]){ nb += near(c[i],c[i+3]); nn++; } for (let j=i+1;j<c.length;j++){ all += near(c[i],c[j]); an++; } }
    const ratio = nn && all ? (nb/nn)/(all/an) : 1, bonus = Math.max(-3, Math.min(3, (ratio-1)*10));
    const total = Math.round(Math.max(45, Math.min(98, raw + bonus)));
    return { total, tone: 1/(1+Math.exp(-logit)), light: Math.max(0, 1 - f[0]/30), rhythm: Math.max(0, Math.min(1, ratio/1.3)), lsd: f[0] }; }
  window.PTScore = { measure, scoreGrid, hd, sdv };
})();
