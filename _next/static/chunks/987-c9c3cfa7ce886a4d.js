"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[987],{14101:(e,t,n)=>{n.d(t,{NE:()=>o,ax:()=>a,normalizeChordSymbol:()=>l,qd:()=>i});var r=n(71017);function i(e){if(!e||!e.trim())return null;let t=e.trim(),n=t.indexOf("/"),i=n>=0?t.slice(0,n).trim():t,o=n>=0?t.slice(n+1).trim():null;i=function(e){let t=e.trim();if(!t)return t;let n=t.match(/^([A-Ga-g][#b]?)\s*(.*)$/);if(!n)return t;let r=n[1],i=(n[2]??"").trim();if(!i)return t;if("M"===i)return r;if("M7"===i)return`${r}maj7`;let o=i.toLowerCase().replace(/\s+/g," ").trim();if(/ø/.test(o))return r+(o=o.replace(/ø\s*7|ø7/gi,"m7b5").replace(/ø/gi,"m7b5"));for(let{pattern:e,replacement:t}of[{pattern:/^\s*major\s+7\s*$|^\s*maj\s+7\s*$|^\s*major7\s*$|^\s*maj7\s*$|^\s*major\s+seventh\s*$/i,replacement:"maj7"},{pattern:/^\s*minor\s+7\s*$|^\s*min\s+7\s*$|^\s*minor7\s*$|^\s*min7\s*$|^\s*minor\s+seventh\s*$/i,replacement:"m7"},{pattern:/^\s*major\s*$|^\s*maj\s*$/i,replacement:""},{pattern:/^\s*minor\s*$|^\s*min\s*$/i,replacement:"m"},{pattern:/^\s*diminished\s+7\s*$|^\s*dim\s+7\s*$|^\s*dim7\s*$/i,replacement:"dim7"},{pattern:/^\s*diminished\s*$|^\s*dim\s*$/i,replacement:"dim"},{pattern:/^\s*half\s+diminished\s*$|^\s*half\s+dim\s*$|^\s*m7b5\s*$/i,replacement:"m7b5"},{pattern:/^\s*augmented\s*$|^\s*aug\s*$/i,replacement:"aug"},{pattern:/^\s*suspended\s+second\s*$|^\s*sus\s+second\s*$|^\s*sus\s+2\s*$|^\s*sus2\s*$/i,replacement:"sus2"},{pattern:/^\s*suspended\s+fourth\s*$|^\s*sus\s+fourth\s*$|^\s*sus\s+4\s*$|^\s*sus4\s*$/i,replacement:"sus4"},{pattern:/^\s*dominant\s+seventh\s*$|^\s*dom\s+7\s*$|^\s*7\s*$/i,replacement:"7"}])if(e.test(o))return t?`${r}${t}`:r;return t}(i);let l=r.$V.get(i);if(l.empty)return null;let s=null;if(o){let e=r.L7.get(o);e&&!e.empty&&(s=e.name)}let a=e=>e.replace(/^([A-G][#b]?)M7$/,"$1maj7").replace(/^([A-G][#b]?)M$/,"$1").replace(/°\s*7|°7/g,"dim7").replace(/°/g,"dim").replace(/ø\s*7|ø7/gi,"m7b5").replace(/ø/g,"m7b5");return{symbol:t,normalizedSymbol:s?`${a(l.symbol)}/${s}`:a(l.symbol),tonic:l.tonic||"",type:l.type||"",notes:l.notes,intervals:l.intervals,quality:l.quality||"",empty:l.empty,bassNote:s??void 0}}function o(e){return null!==i(e)}function l(e){let t=i(e);return t?.normalizedSymbol||e}let s=["Root Position","1st Inversion","2nd Inversion","3rd Inversion"];function a(e){let t=i(e);if(!t||t.empty)return[];let n=t.notes;if(0===n.length)return[];let o=[],l=n.length;for(let e=0;e<l;e++){let i=function(e,t=3){if(0===e.length)return[];let n=[],i=null,o=t;for(let t of e){let e=r.L7.get(t).chroma??0;null!==i&&e<=i&&(o+=1),i=e,n.push(`${t}${o}`)}return n}(n.map((t,r)=>n[(r+e)%l])),a=s[e]??`${e+1}th Inversion`;o.push({id:`${t.normalizedSymbol}-${e}`,name:a,notes:i})}return o}},36680:(e,t,n)=>{n.d(t,{$L:()=>i,CT:()=>a,Ih:()=>p,O1:()=>s,Oc:()=>c,VB:()=>h,cu:()=>g,l2:()=>l,nw:()=>v,rP:()=>f,tb:()=>b,xD:()=>d,yV:()=>m,zV:()=>r,zp:()=>$});let r={small:12,medium:36,large:75},i=["e","B","G","D","A","E"];function o(e){return Math.max(1,Math.min(8,Math.floor(e)))}function l(e,t){return r[t]*o(e)}function s(e){let t=e??"";return!!t.includes("\xb7")&&/^[\s·]+$/.test(t)}function a(e){let t=(e??"").trim();return/^[eBGDAE]\|.+\|$/.test(t)}function m(e){return a(e)&&(e??"").trimStart().startsWith("e|")}function u(e){let t=(e??"").trim().match(/^([eBGDAE])\|/);return t?t[1]:null}function p(e,t){if(t<0||t>=e.length)return 0;let n=t,r=0;if(s(e[t]?.text??"")){if(r=1,(n=t+1)+6>e.length)return 0}else{if(t+6>e.length)return 0;n=t}for(let t=0;t<6;t++){let r=e[n+t]?.text??"";if(!a(r)||u(r)!==i[t])return 0}return r+6}function d(e,t){let n=e.findIndex(e=>e.lineId===t);if(n<0)return null;let r=n;for(;r>0&&a(e[r-1]?.text??"");)r--;let o=n;for(;o<e.length-1&&a(e[o+1]?.text??"");)o++;let l=[];for(let t=r;t<=o;t++){let n=e[t];n&&a(n.text??"")&&l.push(n)}if(0===l.length)return null;let s=l.findIndex(e=>e.lineId===t);if(s<0)return null;let m=6*Math.floor(s/6);if(m+6>l.length)return null;let p=l.slice(m,m+6);for(let e=0;e<6;e++)if(u(p[e].text)!==i[e])return null;return{staffTexts:p.map(e=>e.text??""),lineIds:p.map(e=>e.lineId)}}function c(e){if(!e||6!==e.length)return null;let t=0,n=0,r=[];for(let o=0;o<6;o++){let l=(e[o]??"").trim();if(u(l)!==i[o])return null;let s=l.match(/^.\|(.+)\|$/);if(!s)return null;let a=s[1].split("|").filter(e=>e.length>0);if(0===a.length)return null;if(0===o){if(t=a.length,12!==(n=a[0].length)&&36!==n&&75!==n||t<1||t>8)return null}else if(a.length!==t)return null;let m=[];for(let e of a){let t=e.padEnd(n,"-").slice(0,n);for(let e=0;e<t.length;e++)m.push(t[e])}r.push(m)}let l=12===n?"small":36===n?"medium":"large";return{barCount:o(t),widthPreset:l,grid:r}}function h(e,t){let n=l(e,t);return Array.from({length:i.length},()=>Array.from({length:n},()=>"-"))}function f(e,t,n,l){let s=o(t);if(n===l)return $(e,s,n);let a=r[n],m=r[l],u=$(e,s,n),p=h(s,l),d=i.length;for(let e=0;e<d;e++){let t=u[e]??[];for(let n=0;n<s;n++){let r=Math.min(a,m);for(let i=0;i<r;i++){let r=t[n*a+i];p[e][n*m+i]=void 0===r||""===r?"-":r.slice(0,1)}}}return p}function g(e,t,n,l){let s=o(t),a=o(n);if(s===a)return $(e,a,l);let m=r[l],u=$(e,s,l),p=h(a,l),d=Math.min(s,a),c=i.length;for(let e=0;e<c;e++){let t=u[e]??[];for(let n=0;n<d;n++)for(let r=0;r<m;r++){let i=t[n*m+r];p[e][n*m+r]=void 0===i||""===i?"-":i.slice(0,1)}}return p}function b(e,t,n){let l=o(t),s=r[n];return i.map((t,i)=>{let a=e[i]??[],m=[];for(let e=0;e<l;e++){let t="";for(let n=0;n<s;n++){let r=a[e*s+n];t+=void 0===r||""===r?"-":r.slice(0,1)}m.push(t)}return function(e,t,n,i){let l=o(t),s=r[n],a=1===e.length?e:e.slice(0,1),m="";for(let e=0;e<l;e++)m+=(i&&void 0!==i[e]?i[e].padEnd(s,"-").slice(0,s):"-".repeat(s))+"|";return`${a}|${m}`}(t,l,n,m)})}function $(e,t,n){let r=l(t,n),o=i.length,s=[];for(let t=0;t<o;t++){let n=e[t]??[],i=[];for(let e=0;e<r;e++){let t=n[e];i.push(void 0===t||""===t?"-":t.slice(0,1))}s.push(i)}return s}function x(e){return e<0?"x":0===e?"0":String(e)}function y(e){let t=e.slice(0,6);for(;t.length<6;)t.push(-1);return t}function v(e,t,n){let r=c(e);if(!r)return null;let i=function(e,t){let n=e.match(/^\s*/)?.[0]?.length??0,r=e.slice(n);if(!r.startsWith("e|"))return null;let i=r.lastIndexOf("|");if(i<3)return null;let o=r.slice(2,i).split("|").filter(e=>e.length>0);if(0===o.length)return null;let l=o[0].length;if(12!==l&&36!==l&&75!==l)return null;let s=n+2;for(let e=0;e<o.length;e++){let n=o[e],r=s,i=s+n.length;if(t>=r&&t<i)return e*l+(t-r);s=i+1}return null}(e[0]??"",t);if(null==i)return null;let o=n.frets??[];return!function(e,t,n){let r=e[0]?.length??0;if(r<=0)return!1;let i=y(n);for(let n=0;n<6;n++){let o=5-n,l=x(i[n]);for(let n=0;n<l.length;n++){let i=t+n;if(i>=r||"-"!==e[o]?.[i])return!1}}return!0}(r.grid,i,o)?null:{newStaffLines:b($(function(e,t,n){let r=e.map(e=>[...e]),i=y(n);for(let e=0;e<6;e++){let n=5-e,o=x(i[e]);for(let e=0;e<o.length;e++)r[n][t+e]=o[e]}return r}(r.grid,i,o),r.barCount,r.widthPreset),r.barCount,r.widthPreset),barCount:r.barCount,widthPreset:r.widthPreset}}},85987:(e,t,n)=>{n.d(t,{iY:()=>I,PE:()=>P,ce:()=>A,Yw:()=>R,Gm:()=>O,bj:()=>C,uV:()=>S,AD:()=>k,ab:()=>D,ye:()=>L}),n(12115);var r=n(36680),i=n(98580),o=n(14101);let l={C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,Fb:4,"E#":5,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11,Cb:11,"B#":0},s={name:"E-shape",rootString:6,positions:[0,0,2,2,2,0],baseRootFret:0},a={name:"E-shape",rootString:6,positions:[0,0,2,2,1,0],baseRootFret:0},m={name:"E-shape",rootString:6,positions:[0,0,2,1,2,0],baseRootFret:0},u={name:"E-shape",rootString:6,positions:[0,0,2,0,2,0],baseRootFret:0},p={name:"E-shape",rootString:6,positions:[0,0,2,1,1,0],baseRootFret:0},d={name:"A-shape",rootString:5,positions:[-1,0,2,2,2,0],baseRootFret:0},c={name:"A-shape",rootString:5,positions:[-1,0,2,2,1,0],baseRootFret:0},h={name:"A-shape",rootString:5,positions:[-1,0,2,0,2,0],baseRootFret:0},f={name:"A-shape",rootString:5,positions:[-1,0,2,0,1,0],baseRootFret:0},g={name:"A-shape",rootString:5,positions:[-1,0,2,1,2,0],baseRootFret:0},b={major:[s,d],M:[s,d],"":[s,d],minor:[a,c],m:[a,c],min:[a,c],7:[m,h],"dominant seventh":[m,h],m7:[u,f],min7:[u,f],"minor seventh":[u,f],"-7":[u,f],maj7:[p,g],M7:[p,g],"major seventh":[p,g],maj9:[p,g],"major ninth":[p,g],m9:[u,f],min9:[u,f],"minor ninth":[u,f],9:[m,h],"dominant ninth":[m,h]},$=[4,9,2,7,11,4];function x(e){let t=(0,o.qd)(e);if(!t)return[];let n=t.tonic,r=t.type||"",i=b[r];if(i||("Major"===t.quality?i=b.major:"Minor"===t.quality&&(i=b.minor)),!i){let e=r.toLowerCase();e.includes("m7")||e.includes("min7")?i=b.m7:e.includes("maj7")?i=b.maj7:e.includes("7")?i=b["7"]:(e.includes("m")||e.includes("min"))&&(i=b.m)}if(!i)return[];let s=[];for(let e of i){let r=function(e,t,n){let r=function(e,t){let n=$[e],r=l[t];if(void 0===r)return -1;let i=r-n;return i<0&&(i+=12),i}(+(6!==t.rootString),e);if(r<0||r>12)return null;let i=t.positions.map((e,t)=>-1===e?-1:e+r).map((e,n)=>-1===e?-1:0===t.positions[n]&&r>0?r:e),o=r>0?r:1;return{id:`${n}-${t.name}-${o}`,name:0===r?"Open":`${t.name} (fret ${o})`,positions:i,baseFret:o}}(n,e,t.normalizedSymbol);r&&s.push(r)}return s}let y={C:[{id:"C-open",name:"Open",positions:[-1,3,2,0,1,0],baseFret:1}],D:[{id:"D-open",name:"Open",positions:[-1,-1,0,2,3,2],baseFret:1}],E:[{id:"E-open",name:"Open",positions:[0,2,2,1,0,0],baseFret:1}],G:[{id:"G-open",name:"Open",positions:[3,2,0,0,0,3],baseFret:1}],A:[{id:"A-open",name:"Open",positions:[-1,0,2,2,2,0],baseFret:1}],Am:[{id:"Am-open",name:"Open",positions:[-1,0,2,2,1,0],baseFret:1}],Dm:[{id:"Dm-open",name:"Open",positions:[-1,-1,0,2,3,1],baseFret:1}],Em:[{id:"Em-open",name:"Open",positions:[0,2,2,0,0,0],baseFret:1}],C7:[{id:"C7-open",name:"Open",positions:[-1,3,2,3,1,0],baseFret:1}],D7:[{id:"D7-open",name:"Open",positions:[-1,-1,0,2,1,2],baseFret:1}],E7:[{id:"E7-open",name:"Open",positions:[0,2,0,1,0,0],baseFret:1}],G7:[{id:"G7-open",name:"Open",positions:[3,2,0,0,0,1],baseFret:1}],A7:[{id:"A7-open",name:"Open",positions:[-1,0,2,0,2,0],baseFret:1}],Am7:[{id:"Am7-open",name:"Open",positions:[-1,0,2,0,1,0],baseFret:1}],Dm7:[{id:"Dm7-open",name:"Open",positions:[-1,-1,0,2,1,1],baseFret:1}],Em7:[{id:"Em7-open",name:"Open",positions:[0,2,0,0,0,0],baseFret:1}],Cmaj7:[{id:"Cmaj7-open",name:"Open",positions:[-1,3,2,0,0,0],baseFret:1}],Dmaj7:[{id:"Dmaj7-open",name:"Open",positions:[-1,-1,0,2,2,2],baseFret:1}],Emaj7:[{id:"Emaj7-open",name:"Open",positions:[0,2,1,1,0,0],baseFret:1}],Gmaj7:[{id:"Gmaj7-open",name:"Open",positions:[3,2,0,0,0,2],baseFret:1}],Amaj7:[{id:"Amaj7-open",name:"Open",positions:[-1,0,2,1,2,0],baseFret:1}]};var v=n(35263);let E=[4,4];function w(e){return Number.isFinite(e)?Math.max(1,Math.min(12,Math.floor(e))):4}function S(e){let t=window.localStorage.getItem(`song_time_signature_${e}`),n=window.localStorage.getItem(`song_bpm_${e}`),r=[...E];if(t){let e=/^(\d{1,2})\/(\d{1,2})$/.exec(t.trim());e&&(r=[w(parseInt(e[1],10)),w(parseInt(e[2],10))])}let i=parseInt(n??"",10);return{timeSignature:r,bpm:null!=n&&""!==n&&Number.isFinite(i)?Math.max(40,Math.min(240,Math.round(i))):120}}function C(e,t){if(e.tokenId&&t.tokens){let n=t.tokens.find(t=>t.tokenId===e.tokenId);if(n)return n.startOffset+e.charOffset}return e.charOffset}function O(e,t,n){let r="";r+=`${e.title||"Untitled Song"}
`,r+="=".repeat((e.title||"Untitled Song").length)+"\n\n";let i=M(e);return i.length>0&&(r+="Chords\n",i.forEach(e=>{r+=e+"\n"}),r+="\n"),t&&(r=function(e,t){let[n,r]=t.timeSignature;return`${e}${n}/${r}
${t.bpm} BPM

`}(r,t)),e.sections.forEach(e=>{r+=`[${e.label}]
`,e.lines.forEach(e=>{if(e.chords.length>0){let t=" ".repeat(Math.max(e.text.length,100)).split("");[...e.chords].sort((t,n)=>C(t,e)-C(n,e)).forEach(n=>{let r=n.chordSymbol,i=C(n,e);for(let e=0;e<r.length;e++)i+e<t.length&&(t[i+e]=r[e])}),r+=t.join("").trimEnd()+"\n"}r+=e.text+"\n"}),r+="\n"}),n&&(r+=(0,v.J6)(n)+"\n"),r}function j(e){return e.replace(/\\/g,"\\\\").replace(/\}/g,"\\}")}function F(e){let t=e.text??"",n=[...e.chords].sort((t,n)=>C(t,e)-C(n,e)),r="",i=0;for(let o=0;o<=t.length;o++){for(;i<n.length&&C(n[i],e)===o;){let e=n[i].chordSymbol?.trim();e&&(r+=`[${e}]`),i++}if(o<t.length){let e=t[o];"\\"===e?r+="\\\\":"["===e?r+="\\[":"]"===e?r+="\\]":r+=e}}return r}function A(e,t,n){let o=`{title: ${j(e.title||"Untitled Song")}}
`;if(o+="{comment: Provenance export — ChordPro syntax; tab/measures intended for backup in Provenance. Other apps: best-effort display.}\n",t){let[e,n]=t.timeSignature;o+=`{time: ${e}/${n}}
`,o+=`{tempo: ${t.bpm}}
`}for(let t of(o+="\n",e.sections??[])){let e=(t.sectionType??"VERSE").trim();o+=`{provenance_section_type: ${j(e)}}
`;let n=(t.label??"Section").replace(/\]/g,"");o+=`[${n}]
`,o+=function(e){let t=e??[],n="",o=0;for(;o<t.length;){let e=(0,i.FI)(t,o);if(e>0){n+="{provenance_measures}\n";for(let r=0;r<e;r++)n+=`${F(t[o+r])}
`;n+="{end_provenance_measures}\n",o+=e;continue}let l=(0,r.Ih)(t,o);if(l>0){n+="{start_of_tab}\n";for(let e=0;e<l;e++)n+=`${F(t[o+e])}
`;n+="{end_of_tab}\n",o+=l;continue}n+=`${F(t[o])}
`,o++}return n}(t.lines??[]),o+="\n"}if(n)for(let e of(0,v.J6)(n).split("\n"))o+=`{comment: ${j(e)}}
`;return o}function M(e){let t=new Set;e.sections?.forEach(e=>e.lines?.forEach(e=>e.chords?.forEach(e=>{e.chordSymbol?.trim()&&t.add(e.chordSymbol.trim())})));let n=[];return t.forEach(e=>{let t,r=(t=function(e){if(!(0,o.NE)(e))return[];let t=(0,o.normalizeChordSymbol)(e),n=y[t]||y[e];if(n&&n.length>0)return n;let r=x(e);return r.length>0?r:x(t)}(e)[0])&&t.positions?.length?t.positions.map(e=>e<0?"x":String(e)).join(""):null;null!=r&&n.push(`${e} ${r}`)}),n}function I(e,t){if("guitar"!==t)return"";let n=M(e);return 0===n.length?"":n.map(e=>`  <div class="chord-tab-line">${_(e)}</div>`).join("\n")}function _(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function R(e,t,n,r){let i=`<!DOCTYPE html>
<html>
<head>
  <title>${e.title||"Untitled Song"}</title>
  <style>
    body {
      font-family: 'Courier New', monospace;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      text-align: center;
      margin-bottom: 40px;
    }
    .chord-charts {
      margin-bottom: 40px;
      padding: 16px 0;
      border-bottom: 1px solid #ddd;
    }
    .chord-charts h2 {
      font-size: 1rem;
      font-weight: bold;
      margin-bottom: 12px;
      color: #333;
    }
    /* Grid: up to 8 chord diagrams per row on A4 (half size) */
    .chord-charts > div {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: flex-start;
    }
    .chord-charts > div > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: calc(12.5% - 5px);
      max-width: 80px;
      min-width: 60px;
      padding: 3px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f9f9f9;
      box-sizing: border-box;
    }
    .chord-charts svg {
      max-width: 100%;
      width: 100%;
      height: auto;
    }
    .chord-charts .chord-label, .chord-charts span.text-xs {
      font-size: 0.65rem;
    }
    .chord-tab-line {
      margin-bottom: 5px;
    }
    @media print {
      .chord-charts > div > div {
        max-width: 11%;
        min-width: 0;
      }
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .line-container {
      margin-bottom: 5px;
    }
    .chords {
      color: #0066cc;
      font-weight: bold;
      white-space: pre;
    }
    .lyrics {
      white-space: pre;
    }
    @media print {
      body { margin: 20px; }
    }
  </style>
</head>
<body>
  <h1>${e.title||"Untitled Song"}</h1>
`;return t&&t.trim()&&(i+=`  <div class="chord-charts">
    <h2>Chords</h2>
${t}
  </div>
`),n&&(i+=function(e){let[t,n]=e.timeSignature;return`  <div class="song-rhythm" style="margin-bottom: 28px; font-family: 'Courier New', monospace; white-space: pre;">
    <div>Time: ${t}/${n}</div>
    <div>Tempo: ${e.bpm} BPM</div>
  </div>
`}(n)),e.sections.forEach(e=>{i+=`  <div class="section">
`,i+=`    <div class="section-title">[${e.label}]</div>
`,e.lines.forEach(e=>{if(i+=`    <div class="line-container">
`,e.chords.length>0){let t=e.text.length,n=" ".repeat(t).split("");[...e.chords].sort((t,n)=>C(t,e)-C(n,e)).forEach(t=>{let r=t.chordSymbol,i=C(t,e);for(let e=0;e<r.length;e++)i+e>=0&&i+e<n.length&&(n[i+e]=r[e])}),i+=`      <div class="chords">${n.join("")}</div>
`}i+=`      <div class="lyrics">${e.text}</div>
`,i+=`    </div>
`}),i+=`  </div>
`}),r&&(i+=`<div class="author-details" style="margin-top:40px;padding-top:16px;border-top:1px solid #ddd;font-size:0.85rem;color:#333;">
  <p style="font-weight:bold;margin:0 0 4px 0;">${v.Qz} (snapshot ${r.snapshotAt})</p>
  ${r.songwriterName?`<p style="margin:2px 0;">Songwriter: ${_(r.songwriterName)}</p>`:""}
  ${r.legalName?`<p style="margin:2px 0;">Legal name: ${_(r.legalName)}</p>`:""}
  ${r.contactOrWebsite?`<p style="margin:2px 0;">Contact: ${_(r.contactOrWebsite)}</p>`:""}
</div>
`),i+=`</body>
</html>`}function D(e,t,n,r){let i=R(e,t,n,r),o=new Blob([i=i.replace("</body>","<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>\n</body>")],{type:"text/html;charset=utf-8"}),l=URL.createObjectURL(o),s=window.open(l,"_blank","noopener,noreferrer");if(s)s.focus(),setTimeout(()=>URL.revokeObjectURL(l),1e4);else{let e=document.createElement("a");e.href=l,e.target="_blank",e.rel="noopener noreferrer",document.body.appendChild(e),e.click(),document.body.removeChild(e),setTimeout(()=>URL.revokeObjectURL(l),6e4)}}function L(e){if("u"<typeof document||"u"<typeof DOMParser)return e;let t=new DOMParser().parseFromString(e,"text/html"),n=new XMLSerializer;return t.querySelectorAll("svg").forEach(e=>{let r=n.serializeToString(e),i="u">typeof btoa?btoa(unescape(encodeURIComponent(r))):"";if(!i)return;let o=t.createElement("img");o.setAttribute("src",`data:image/svg+xml;base64,${i}`);let l=e.getAttribute("width")||e.getAttribute("viewBox")?.split(/\s+/)[2]||"120",s=e.getAttribute("height")||e.getAttribute("viewBox")?.split(/\s+/)[3]||"120";o.setAttribute("width",l.replace(/px$/,"")),o.setAttribute("height",s.replace(/px$/,"")),o.setAttribute("alt","Chord diagram"),e.parentNode?.replaceChild(o,e)}),"<!DOCTYPE html>\n<html>"+(t.documentElement?.innerHTML??"")+"</html>"}function k(e){let t="----=_NextPart_000_0000_"+Math.random().toString(36).slice(2,12);return`MIME-Version: 1.0\r
Content-Type: multipart/related; boundary="${t}"; type="text/html"\r
\r
--${t}\r
Content-Type: text/html; charset=utf-8\r
Content-Transfer-Encoding: 8bit\r
Content-Location: song.html\r
\r
`+e+"\r\n"+`--${t}--\r
`}function P(e,t,n){let r=new Blob([e],{type:n}),i=URL.createObjectURL(r),o=document.createElement("a");o.href=i,o.download=t,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(i)}},98580:(e,t,n)=>{function r(e,t){let n="";for(let r=1;r<=e;r++)n+=function(e,t){let n=String(t);switch(e){case"beat":return`${n} . . . `;case"ampersand":return`${n} . & . `;case"sixteenth":return`${n} e & a `;case"triplet":return`${n} + a `;default:return e}}(t,r);return n}function i(e){let t=Math.max(1,Math.min(8,Math.floor(e.barCount))),n=Math.max(2,Math.min(12,Math.floor(e.beatsPerBar))),i=e.subdivision,o=Math.ceil(t/2),l=[];for(let e=0;e<o;e++){let s=2*e+1<t,a=e===o-1,m=0===e?"||: ":"  | ";m+=r(n,i),s&&(m+="| ",m+=r(n,i)),m+=a?":||":"|",l.push(m)}return l.join("\n")}n.d(t,{FI:()=>u,Zs:()=>m,hS:()=>i,hy:()=>o,ik:()=>l});let o={beat:"Beat",ampersand:"&",sixteenth:"16th",triplet:"Triplet"};function l(e){return null!=e&&(!!e.trim().startsWith("||:")||/^\s+\|\s/.test(e))}let s={beat:/^(\d+) \. \. \.\s*/,ampersand:/^(\d+) \. & \.\s*/,sixteenth:/^(\d+) e & a\s*/,triplet:/^(\d+) \+ a\s*/};function a(e,t){let n=e.trimStart(),r=0,i=s[t];for(;n.length>0;){let e=n.match(i);if(!e)return null;n=n.slice(e[0].length),r+=1}return r<2||r>12?null:r}function m(e){let t=function(e){if(0===e.length)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n].trimEnd();if(0===n){let e=r.match(/^\|\|:\s*(.*)$/);if(!e)return[];r=e[1].trimEnd()}else{let e=r.match(/^\s*\|\s+(.*)$/);if(!e)return[];r=e[1].trimEnd()}let i=(r=n===e.length-1?r.replace(/:?\|\|\s*$/,"").trimEnd():r.replace(/\|\s*$/,"").trimEnd()).split("|").map(e=>e.trim()).filter(e=>e.length>0);t.push(...i)}return t}(e);if(t.length<1||t.length>8)return null;let n=t[0];for(let e of["beat","ampersand","sixteenth","triplet"]){let r=a(n,e);if(null!=r&&t.every(t=>a(t,e)===r))return{barCount:t.length,beatsPerBar:r,subdivision:e}}return null}function u(e,t){if(t>=e.length||!l(e[t]?.text))return 0;let n=t;for(;n<e.length&&l(e[n]?.text);)n+=1;return n-t}}}]);