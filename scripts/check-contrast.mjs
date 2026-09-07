import fs from 'fs';
const css=fs.readFileSync('public/css/tokens.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const blockOf=re=>{const m=css.match(re);const o={};if(m)for(const d of m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g))o[d[1]]=d[2].trim();return o;};
const names=a=>[...new Set([...css.matchAll(new RegExp('\\['+a+'="([^"]+)"\\]','g'))].map(m=>m[1]))];
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};

// split light-dark(a, b) on the TOP-LEVEL comma, respecting nested parens
function ldArgs(v){
  const i=v.indexOf('light-dark('); if(i<0) return null;
  let depth=0,start=i+11,comma=-1,end=-1;
  for(let j=start;j<v.length;j++){
    const c=v[j];
    if(c==='(')depth++;
    else if(c===')'){ if(depth===0){end=j;break;} depth--; }
    else if(c===','&&depth===0) comma=j;
  }
  if(comma<0||end<0) return null;
  return [v.slice(start,comma).trim(), v.slice(comma+1,end).trim()];
}
const roles=blockOf(/:root \{\n((?:\s*--(?:text|bg|link|border|selection)[\s\S]*?))\n\}/);
// self-test: every role must parse into two well-formed var() references
let bad=[];
for(const [k,v] of Object.entries(roles)){
  const a=ldArgs(v);
  if(!a||!a.every(x=>/^var\(--[\w-]+\)$/.test(x))) bad.push(k+' -> '+JSON.stringify(a));
}
if(bad.length){console.log('PARSER SELF-TEST FAILED:\n  '+bad.join('\n  '));process.exit(1);}
console.log('✓ parser self-test: all '+Object.keys(roles).length+' roles parse into two var() refs\n');

const prims={'--white':'#ffffff','--black':'#000000'};
const temps=names('temperature'), accs=names('accent');
let fails=[],n=0;
for(const s of ['light','dark']) for(const t of temps) for(const a of accs){
  const env={...prims,...blockOf(new RegExp('\\[temperature="'+t+'"\\] \\{([\\s\\S]*?)\\}')),
                      ...blockOf(new RegExp('\\[accent="'+a+'"\\] \\{([\\s\\S]*?)\\}'))};
  const res=k=>{const p=ldArgs(roles[k]||''); if(!p) return null;
    const m=(s==='light'?p[0]:p[1]).match(/var\((--[\w-]+)\)/); return m?env[m[1]]:null;};
  for(const role of ['--text-primary','--text-secondary','--text-tertiary','--link','--link-hover'])
    for(const bg of ['--bg-primary','--bg-secondary']){
      const fg=res(role), b=res(bg);
      if(!fg||!b){ fails.push(`  UNRESOLVED ${s}/${t}/${a} ${role} on ${bg}`); continue; }
      const r=ratio(fg,b); n++;
      if(r<4.5) fails.push(`  ${s}/${t}/${a}  ${role.replace('--','')} on ${bg.replace('--','')}  ${fg}/${b}  ${r.toFixed(2)}:1`);
    }
}
console.log(`2×${temps.length}×${accs.length} = ${2*temps.length*accs.length} appearances, ${n} pairs checked vs AA 4.5:1\n`);
console.log(fails.length?'FAILURES ('+fails.length+'):\n'+fails.slice(0,24).join('\n')+(fails.length>24?`\n  ... +${fails.length-24} more`:''):'✓ every pair passes');
