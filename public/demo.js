export function demoSnapshot() {
  const now = Date.now(), wave = 1 + .2*Math.sin(now/12000);
  const specs = [
    ['firefox',8236,'142.250.80.46','rr1---sn-p5qlsn7s.googlevideo.com','UDP',4,3100000*wave,48000],
    ['firefox',8236,'142.250.80.14','tv.youtube.com','TCP',2,18500,2200],
    ['Spotify',4512,'35.186.224.25','audio.spotify.com','TCP',3,42000,1700],
    ['OneDrive',6740,'13.107.42.12','onedrive.live.com','TCP',4,12000,1400000*wave],
    ['Slack',9820,'54.192.0.18','slack.com','TCP',2,6500,1900],
    ['Code',10524,'140.82.112.4','github.com','TCP',2,220000,7500],
    ['firefox',8236,'104.18.32.7','figma.com','TCP',2,28000,3000],
    ['codex',1948,'104.18.32.8','chatgpt.com','TCP',3,125000,45000],
    ['claude',7812,'160.79.104.10','claude.ai','TCP',2,35000,12000],
    ['OneDrive',6740,'20.190.154.15','login.microsoftonline.com','TCP',1,0,0]
  ];
  const connections = specs.flatMap(([app,pid,ip,domain,protocol,count,download,upload],i)=>Array.from({length:count},(_,j)=>({
    id:`demo-${i}-${j}`,app,pid,protocol,localAddress:'192.168.1.42',localPort:51000+i*10+j,remoteAddress:ip,remotePort:443,
    state:protocol==='UDP'?'Observed':'Established',scope:'Internet',domainCandidates:[domain],
    receiveRate:download/count,sendRate:upload/count,trafficSource:'Sample',receivedBytes:download*60/count,sentBytes:upload*60/count,
    receivedBytes60m:download/(i===0?wave:1)*3600/count,sentBytes60m:upload/(i===3?wave:1)*3600/count,
    usageHistory:Array.from({length:60},(_,minute)=>({
      received:download/(i===0?wave:1)*60/count*(1+.5*Math.sin((minute+i)*Math.PI/10)),
      sent:upload/(i===3?wave:1)*60/count*(1+.4*Math.sin((minute+i)*Math.PI/6))
    })),
    firstSeen:new Date(now-180000-i*1000).toISOString(),lastSeen:new Date(now).toISOString()
  })));
  const receiveRate = specs.reduce((sum,s)=>sum+s[6],0), sendRate = specs.reduce((sum,s)=>sum+s[7],0);
  return {mode:'demo',computer:'KRIS-PC',timestamp:new Date(now).toISOString(),issues:[],connections,
    traffic:{available:true,timestamp:new Date(now).toISOString(),eventsLost:0,cityUsage:specs.map(([app,pid,remoteAddress,domain,protocol],i)=>({app,pid,remoteAddress,remotePort:443,protocol,scope:'Internet',domainCandidates:[domain],receivedBytesTotal:([140,0.015,0.12,8.4,0.04,0.18,0.7,3.5,1.2,0][i])*1024**3,sentBytesTotal:0}))},totals:{receiveRate,sendRate,ready:true},
    history:Array.from({length:75},(_,i)=>({timestamp:new Date(now-(74-i)*8000).toISOString(),receiveRate:receiveRate*(.8+.2*Math.sin(i*.3)),sendRate:sendRate*(.8+.2*Math.sin(i*.2)),connections:connections.length})),
    adapters:[{id:'demo-wifi',name:'Wi-Fi',description:'Intel Wi-Fi 6 AX201',status:'Up',speed:'866.7 Mbps',mac:'A4-B1-C1-28-61-9F',ipv4:['192.168.1.42'],ipv6:[],gateway:['192.168.1.1'],dns:['192.168.1.1'],receivedBytes:2581471232,sentBytes:371256320,receivedErrors:0,sentErrors:0,receiveRate,sendRate}]
  };
}
