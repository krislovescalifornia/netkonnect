import { serviceIdentity } from './routes.js';
import { analyze } from './analytics-model.js';
let cache,cacheDay;
export function demoAnalytics(options={},now=Date.now()) {
  const day=new Date(now).toISOString().slice(0,10);
  if(cacheDay!==day) {
    cacheDay=day;cache=[];
    const specs=[['firefox','142.250.80.46','video.googlevideo.com',8236,1.3,.04],['firefox','104.18.32.7','figma.com',8236,.07,.02],['OneDrive','13.107.42.12','onedrive.live.com',6740,.06,1.1],['Spotify','35.186.224.25','audio.spotify.com',4512,.13,.005],['Code','140.82.112.4','github.com',10524,.2,.04],['Slack','54.192.0.18','slack.com',9820,.025,.015],['codex','104.18.32.8','chatgpt.com',1948,.16,.055]];
    const end=Math.floor(now/3600000)*3600000;
    for(let h=0;h<365*24;h++) {
      const at=end-h*3600000,date=new Date(at),hour=date.getHours();
      const rhythm=hour<6?.015:hour<9?.2:hour<17?.7:hour<23?1.3:.25;
      for(const [app,address,hostname,pid,download,upload] of specs) {
        const variation=.7+.3*Math.sin(h*.7+pid)+.15*Math.cos(h*.13),weekend=[0,6].includes(date.getDay())?(app==='firefox'?1.4:.4):1;
        cache.push({at,app,service:serviceIdentity({remoteAddress:address,domainCandidates:[hostname]}),protocol:app==='firefox'?'UDP':'TCP',scope:'Internet',received:Math.round(download*1024**3*rhythm*variation*weekend),sent:Math.round(upload*1024**3*rhythm*variation*weekend),pids:[pid],ports:[443],addresses:[address],hostnames:[hostname],firstSeen:at,lastSeen:Math.min(at+3599000,now)});
      }
    }
  }
  const result=analyze(cache,options,now),offset=Math.max(0,Number(options.offset)||0);
  return {...result,matchCount:result.matches.length,matches:options.export?result.matches:result.matches.slice(offset,offset+50),offset,archive:{from:cache.at(-1).at,to:cache[0].at,hours:365*24,seconds:365*86400,retentionDays:400,error:null},catalog:{apps:[...new Set(cache.map(r=>r.app))],services:[...new Map(cache.map(r=>[r.service.key,r.service])).values()]}};
}
