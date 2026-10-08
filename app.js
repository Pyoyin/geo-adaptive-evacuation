"use strict";
const map=L.map("map").setView([-6.95,106.8],10);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"}).addTo(map);
const $=id=>document.getElementById(id);
const H={banjir:"Banjir",banjir_bandang:"Banjir Bandang",gempabumi:"Gempabumi",gunungapi:"Gunungapi",tanahlongsor:"Tanah Longsor",tsunami:"Tsunami"};
let network=null,shelters=null,adj=null,startMarker=null,routeLayer=null,pick=false;
const overlayCache={};
const hazardFiles={banjir:"data/hazard_banjir.geojson",banjir_bandang:"data/hazard_banjir_bandang.geojson",gempabumi:"data/hazard_gempabumi.geojson",gunungapi:"data/hazard_gunungapi.geojson",tanahlongsor:"data/hazard_tanahlongsor.geojson",tsunami:"data/hazard_tsunami.geojson"};
const hazardLabels={banjir:"Banjir",banjir_bandang:"Banjir Bandang",gempabumi:"Gempabumi",gunungapi:"Gunungapi",tanahlongsor:"Tanah Longsor",tsunami:"Tsunami"};
const layerColors={1:"#2ca25f",2:"#fec44f",3:"#de2d26"};
const boundaryUrl="https://geoservices.big.go.id/gis/rest/services/DISIGT/BatasWilayah/FeatureServer/0/query?where=kdbbps%3D%273202%27&outFields=namobj%2Ckdbbps&returnGeometry=true&f=geojson";
function st(m,c=""){$("status").textContent=m;$("status").className="status "+c}
function cls(v){v=Number(v)||0;return v>=3?"Tinggi":v>=2?"Sedang":v>=1?"Rendah":"Tidak terklasifikasi"}
function hav(a,b){const R=6371000,p1=a[1]*Math.PI/180,p2=b[1]*Math.PI/180,dp=(b[1]-a[1])*Math.PI/180,dl=(b[0]-a[0])*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function segd(p,a,b){const s=111320*Math.cos(p[1]*Math.PI/180),t=110540,px=p[0]*s,py=p[1]*t,ax=a[0]*s,ay=a[1]*t,bx=b[0]*s,by=b[1]*t,dx=bx-ax,dy=by-ay,q=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-(ax+q*dx),py-(ay+q*dy))}
function nearNode(ll){let id=-1,d=Infinity;for(let i=0;i<network.nodes.length;i++){const n=network.nodes[i];const x=hav([ll.lng,ll.lat],[n.lon,n.lat]);if(x<d){d=x;id=i}}return{id,d}}
function nearEdge(ll){let best=null,d=Infinity,p=[ll.lng,ll.lat];for(const e of network.edges){const s=e.shape||[];for(let i=1;i<s.length;i++){const x=segd(p,s[i-1],s[i]);if(x<d){d=x;best=e}}}return{edge:best,d}}
function push(h,x){let i=h.length;h.push(x);while(i){let p=(i-1)>>1;if(h[p][0]<=x[0])break;h[i]=h[p];i=p;h[i]=x}}
function pop(h){const x=h[0],z=h.pop();if(h.length){h[0]=z;let i=0;for(;;){let l=i*2+1,r=l+1,s=i;if(l<h.length&&h[l][0]<h[s][0])s=l;if(r<h.length&&h[r][0]<h[s][0])s=r;if(s===i)break;[h[i],h[s]]=[h[s],h[i]];i=s}}return x}
function build(){adj=Array.from({length:network.nodes.length},()=>[]);network.edges.forEach((e,i)=>{adj[e.a].push([e.b,i]);adj[e.b].push([e.a,i])})}
function hf(v){v=Number(v)||0;return v>=3?25:v>=2?4:v>=1?1.25:1}
function rf(v){v=Number(v)||0;return v>=3?4:v>=2?1.7:v>=1?1.1:1}
function cost(e,mode,h){let c=Number(e.len_m)||0;if(mode==="nearest")return c;c*=hf(e[h])*rf(e.risk);if(h==="tsunami"){const z=[network.nodes[e.a].elev_m,network.nodes[e.b].elev_m].map(Number).filter(Number.isFinite);if(z.length){const q=z.reduce((a,b)=>a+b,0)/z.length;c*=q<10?8:q<25?3:q<50?1.4:.65}}return c}
function dijTargets(src,targets,mode,h){const n=network.nodes.length,d=new Float64Array(n),p=new Int32Array(n);d.fill(Infinity);p.fill(-1);const q=[],remaining=new Set(targets),settled=new Set();d[src]=0;push(q,[0,src]);while(q.length&&remaining.size){const [du,u]=pop(q);if(du!==d[u]||settled.has(u))continue;settled.add(u);if(remaining.has(u))remaining.delete(u);for(const[v,ei]of adj[u]){const nd=du+cost(network.edges[ei],mode,h);if(nd<d[v]){d[v]=nd;p[v]=ei;push(q,[nd,v])}}}return{d,p}}
function reconstruct(src,t,p){let u=t,ids=[];for(let k=0;k<network.nodes.length+5&&u!==src;k++){const ei=p[u];if(ei<0)return null;ids.push(ei);const e=network.edges[ei];u=e.a===u?e.b:e.a}if(u!==src)return null;ids.reverse();let cur=src,out=[];for(const ei of ids){const e=network.edges[ei],s=e.shape||[];if(e.a===cur){for(const x of s)out.push([x[1],x[0]]);cur=e.b}else{for(let i=s.length-1;i>=0;i--)out.push([s[i][1],s[i][0]]);cur=e.a}}return out}
function assess(ll){if(!network)return;const x=nearEdge(ll),h=$("hazard").value;if(!x.edge){$("assessment").textContent="Tidak menemukan ruas terdekat.";return}$("assessment").innerHTML=`<b>Status titik awal</b><br>${H[h]}: <b>${cls(x.edge[h])}</b><br>Risiko: <b>${cls(x.edge.risk)}</b><br>Jarak ke jalan: <b>${Math.round(x.d)} m</b>`}
function setStart(ll){if(startMarker)map.removeLayer(startMarker);startMarker=L.marker(ll,{draggable:true}).addTo(map);startMarker.on("dragend",()=>assess(startMarker.getLatLng()));assess(ll);$("route").disabled=false;st("Titik awal siap. Pilih bencana lalu klik Cari rute.","ok")}
function score(f,h,m,d){if(m==="nearest")return d;const p=f.properties||{};let x=d*hf(p[h])*rf(p.risk);if(h==="tsunami"){const e=Number(p.elev_m);if(Number.isFinite(e))x*=e<10?8:e<25?3:e<50?1.4:.65}return x}
function route(){if(!network||!shelters){st("Data belum siap. Lihat diagnostik.","err");return}if(!startMarker){st("Tentukan titik awal dulu.","warn");return}const m=$("mode").value,h=$("hazard").value,s=nearNode(startMarker.getLatLng());st("Menyiapkan kandidat shelter…");setTimeout(()=>{const features=(shelters.features||[]).filter(f=>f.geometry&&f.geometry.type==="Point");const origin=[startMarker.getLatLng().lng,startMarker.getLatLng().lat];const candidates=features.map(f=>{const [lon,lat]=f.geometry.coordinates;return{f,n:nearNode(L.latLng(lat,lon)),geo:hav(origin,[lon,lat])}}).filter(x=>x.n.id>=0).sort((a,b)=>a.geo-b.geo).slice(0,20);const targets=[...new Set(candidates.map(x=>x.n.id))];st(`Menghitung rute ke ${targets.length} shelter kandidat…`);setTimeout(()=>{const D=dijTargets(s.id,targets,m,h);let best=null;for(const c of candidates){if(!Number.isFinite(D.d[c.n.id]))continue;const nd=D.d[c.n.id]+s.d+c.n.d,sc=score(c.f,h,m,nd);if(!best||sc<best.sc)best={...c,nd,sc}}if(!best){st("Tidak ada shelter terhubung. Coba titik awal lain.","err");return}const xy=reconstruct(s.id,best.n.id,D.p);if(!xy){st("Rute gagal direkonstruksi.","err");return}if(routeLayer)map.removeLayer(routeLayer);routeLayer=L.polyline(xy,{weight:6}).addTo(map);map.fitBounds(routeLayer.getBounds(),{padding:[40,40]});const p=best.f.properties||{};$("result").innerHTML=`<b>${m==="nearest"?"Shelter terdekat":"Rute hazard-aware"}</b><br>Tujuan: <b>${p.REMARK||p.NAMOBJ||"Shelter"}</b><br>Jarak jaringan: <b>${(best.nd/1000).toFixed(2)} km</b><br>${H[h]} di tujuan: <b>${cls(p[h])}</b><br>Risiko di tujuan: <b>${cls(p.risk)}</b>`;st("Rute berhasil dan mengikuti network jalan darat.","ok")},20)},20)}
async function load(url){const r=await fetch(url+"?v=20261008");if(!r.ok)throw Error(`${url} HTTP ${r.status}`);return r.json()}
async function addBoundaryLayer(){
  if(overlayCache.boundary){if(!map.hasLayer(overlayCache.boundary))overlayCache.boundary.addTo(map);return}
  st("Memuat batas Kabupaten Sukabumi…");
  try{
    const g=await fetch(boundaryUrl).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()});
    overlayCache.boundary=L.geoJSON(g,{style:{color:"#111",weight:3,fill:false},onEachFeature:(f,l)=>l.bindTooltip("Kabupaten Sukabumi",{sticky:true})}).addTo(map);
    st("Batas Kabupaten Sukabumi siap.","ok");
  }catch(e){st("Gagal memuat batas Sukabumi: "+e.message,"err")}
}
function setupLayers(){
  const panel=document.createElement("div");
  panel.className="layer-help";
  panel.innerHTML="<b>Layer Peta</b><div class='layer-row'><input id='lyr-boundary' type='checkbox'><label for='lyr-boundary'>Batas Kabupaten Sukabumi</label></div>";
  document.body.appendChild(panel);
  document.getElementById("lyr-boundary").onchange=e=>{if(e.target.checked)addBoundaryLayer();else if(overlayCache.boundary)map.removeLayer(overlayCache.boundary)};
}
async function boot(){try{st("1/2 Memuat network jalan…");network=await load("roads_network_hazard_aware.json");if(!network.nodes||!network.edges)throw Error("struktur network invalid");build();st(`1/2 Network OK — ${network.nodes.length.toLocaleString()} node, ${network.edges.length.toLocaleString()} ruas.`,"ok")}catch(e){st("GAGAL network: "+e.message,"err");$("diagnostic").innerHTML="Pastikan <b>roads_network_hazard_aware.json</b> berada satu level dengan index.html.";return}try{st("2/2 Memuat shelter…");shelters=await load("shelters_proper.geojson");if(!shelters.features)throw Error("GeoJSON shelter invalid");$("diagnostic").innerHTML=`<b>SEMUA DATA SIAP</b><br>Network: ${network.nodes.length.toLocaleString()} node / ${network.edges.length.toLocaleString()} ruas<br>Shelter: ${shelters.features.length.toLocaleString()} titik`;$("route").disabled=false;assess(map.getCenter());st("SEMUA DATA SIAP — pilih titik awal.","ok")}catch(e){st("GAGAL shelter: "+e.message,"err");$("diagnostic").innerHTML="File <b>shelters_proper.geojson</b> tidak ditemukan/terbaca."}}
$("mode").onchange=()=>st($("mode").value==="nearest"?"Mode terdekat: jarak network minimum.":"Mode hazard-aware: bahaya + risiko menjadi biaya routing.","ok");
$("hazard").onchange=()=>{if(startMarker)assess(startMarker.getLatLng());const cb=document.getElementById("lyr-hazard");if(cb&&cb.checked){Object.keys(hazardFiles).forEach(k=>{if(overlayCache[k]&&map.hasLayer(overlayCache[k]))map.removeLayer(overlayCache[k])});addHazardLayer($("hazard").value)}};
$("pick").onclick=()=>{pick=true;st("Klik peta untuk menentukan titik awal.","warn")};
map.on("click",e=>{if(pick){pick=false;setStart(e.latlng)}});
$("locate").onclick=()=>{if(!navigator.geolocation){st("Browser tidak mendukung lokasi.","err");return}st("Meminta lokasi…");navigator.geolocation.getCurrentPosition(p=>{const ll=L.latLng(p.coords.latitude,p.coords.longitude);map.setView(ll,14);setStart(ll)},e=>st("Lokasi gagal: "+e.message,"err"),{enableHighAccuracy:true,timeout:10000})};
$("route").onclick=route;
$("clear").onclick=()=>{if(routeLayer)map.removeLayer(routeLayer);if(startMarker)map.removeLayer(startMarker);routeLayer=null;startMarker=null;$("result").innerHTML="";$("assessment").innerHTML="Tentukan titik awal.";$("route").disabled=true;st("Rute dihapus.")};
setupLayers();
boot();
