import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// Broad common names are represented by familiar species found in Colorado.
const birds = [
  {name:'American robin', scientific:'Turdus migratorius', category:'THE BACKYARD VISITOR', habitat:'Woodlands & yards', length:[23,28], colors:['#a65c3e','#515b50','#e8d5b9','#d6ae5b'], description:'A familiar flash of warm rust, often spotted listening for earthworms in the grass.', behavior:'ground'},
  {name:'House sparrow', scientific:'Passer domesticus', category:'THE NEIGHBORHOOD REGULAR', habitat:'Towns & farms', length:[14,18], colors:['#a78969','#725540','#d5c7a8','#a3845d'], description:'A social little bird with a gray crown, chestnut back and a lively, chatty voice.', behavior:'tree'},
  {name:'Common grackle', scientific:'Quiscalus quiscula', category:'THE IRIDESCENT ONE', habitat:'Wetlands & parks', length:[28,34], colors:['#303b3b','#293d46','#40453d','#34312c'], description:'Long-tailed and glossy, this resourceful blackbird shines blue and bronze in the sun.', behavior:'ground'},
  {name:'European starling', scientific:'Sturnus vulgaris', category:'THE MIMIC', habitat:'Fields & towns', length:[20,23], colors:['#42463e','#374a48','#a3aa91','#e2b95c'], description:'A gifted mimic with a short tail and dark plumage that glitters with pale speckles.', behavior:'ground'},
  {name:'Blue jay', scientific:'Cyanocitta cristata', category:'THE BOLD ONE', habitat:'Trees & neighborhoods', length:[25,30], colors:['#82a8b7','#5685a0','#ecede1','#303a37'], description:'Listen for its unmistakable calls, then look for blue feathers, a perky crest and a dark necklace.', behavior:'tree', crest:true},
  {name:'Barn swallow', scientific:'Hirundo rustica', category:'THE AERIAL ACROBAT', habitat:'Open fields & water', length:[15,19], colors:['#bd7f58','#344f5b','#e6c6a0','#30352e'], description:'A graceful flyer with a deeply forked tail, sweeping low over the fields for insects.', behavior:'flying', fork:true},
  {name:'Red-winged blackbird', scientific:'Agelaius phoeniceus', category:'THE MARSH SINGER', habitat:'Marshes & fields', length:[17,24], colors:['#292f2b','#252c28','#b94d35','#34342d'], description:'The male’s scarlet shoulder patches are a bright signature of spring around wetlands.', behavior:'tree'},
  {name:"Brewer's blackbird", scientific:'Euphagus cyanocephalus', category:'THE OPEN-COUNTRY BLACKBIRD', habitat:'Fields & towns', length:[20,25], colors:['#303934','#303f3c','#4f5c50','#34342d'], description:'A sleek, dark blackbird often seen walking across lawns and gathering in sociable flocks.', behavior:'ground'},
  {name:'Yellow-headed blackbird', scientific:'Xanthocephalus xanthocephalus', category:'THE MARSH ORIGINAL', habitat:'Freshwater marshes', length:[21,26], colors:['#34352e','#e7b848','#e6d69e','#3d382d'], description:'A golden head and a wonderfully raspy song make this wetland bird hard to miss.', behavior:'tree'},
  {name:"Cooper's hawk", scientific:'Accipiter cooperii', category:'THE WOODLAND HUNTER', habitat:'Woodlands & suburbs', length:[35,50], colors:['#a6846c','#667d80','#e5d7c1','#d2b05a'], description:'A swift woodland hawk with rounded wings, a long banded tail and an intent gaze.', behavior:'flying'},
  {name:'Red-tailed hawk', scientific:'Buteo jamaicensis', category:'THE HIGH SOARER', habitat:'Open country', length:[45,65], colors:['#a78768','#665844','#e2d3b8','#d1ac52'], description:'Watch for broad wings circling above the plains and the rusty-red tail of an adult.', behavior:'flying'},
  {name:'Bald eagle', scientific:'Haliaeetus leucocephalus', category:'THE RIVER SENTINEL', habitat:'Lakes & rivers', length:[71,96], colors:['#594d3d','#f1efe1','#ddd8c2','#dfb950'], description:'An unmistakable white head and tail distinguish this powerful bird of the waterways.', behavior:'flying'},
  {name:'Great horned owl', scientific:'Bubo virginianus', category:'THE NIGHT WATCHER', habitat:'Woodlands & cliffs', length:[46,63], colors:['#8e7960','#75634e','#e3d2ad','#c29a4f'], description:'Ear-like feather tufts and golden eyes give this mostly nocturnal hunter its iconic silhouette.', behavior:'tree', crest:true},
  {name:'Broad-tailed hummingbird', scientific:'Selasphorus platycercus', category:'THE TINY JEWEL', habitat:'Mountain meadows', length:[8,10], colors:['#91a982','#577e66','#eee6d0','#353b2e'], description:'This tiny mountain visitor hovers at flowers, its wings producing a distinctive high trill.', behavior:'flying', longBeak:true},
  {name:'House finch', scientific:'Haemorhous mexicanus', category:'THE ROSY SINGER', habitat:'Neighborhoods & scrub', length:[12,15], colors:['#af7064','#bd6254','#e4d4bd','#a58d70'], description:'The rosy-red male is a familiar singer on feeders and in neighborhood trees.', behavior:'tree'},
  {name:'Killdeer', scientific:'Charadrius vociferus', category:'THE CLEVER SHOREBIRD', habitat:'Gravel & open fields', length:[20,28], colors:['#b5a58b','#8b7a66','#f0eadc','#494b40'], description:'Two dark breast bands and a ringing call mark this shorebird, often found far from water.', behavior:'ground'},
  {name:'Rock pigeon', scientific:'Columba livia', category:'THE CITY DWELLER', habitat:'Towns & cliffs', length:[29,37], colors:['#899a99','#617c79','#b9c5bb','#4c5650'], description:'Look closely at this familiar city bird to see its iridescent neck and dark wing bars.', behavior:'ground'},
  {name:'Mallard', scientific:'Anas platyrhynchos', category:'THE POND FAVORITE', habitat:'Ponds & wetlands', length:[50,65], colors:['#a7a291','#4c7765','#e7e1d0','#d3ac55'], description:'The male mallard’s glossy green head and yellow bill are familiar sights on local ponds.', behavior:'ground'},
  {name:'Canada goose', scientific:'Branta canadensis', category:'THE SKY TRAVELER', habitat:'Lakes & fields', length:[75,110], colors:['#a49a85','#353a32','#e9e9d8','#353b34'], description:'A black neck and white cheek patch make this familiar, honking goose easy to recognize.', behavior:'flying'},
  {name:'American white pelican', scientific:'Pelecanus erythrorhynchos', category:'THE BIG DRIFTER', habitat:'Lakes & reservoirs', length:[130,180], colors:['#e8e9dc','#f1efe3','#b7c1b2','#d5a35b'], description:'An enormous white waterbird that often travels in graceful groups high over reservoirs.', behavior:'flying', longBeak:true},
  {name:'Great cormorant', scientific:'Phalacrocorax carbo', category:'THE WATER DIVER', habitat:'Coasts & large waters', length:[80,100], colors:['#39433d','#343e37','#d5d3b9','#b69a63'], description:'A large, dark diving bird that may hold its wings open to dry. It is rare inland in Colorado.', behavior:'flying'},
  {name:"Ring-billed gull", scientific:'Larus delawarensis', category:'THE LAKESIDE GLIDER', habitat:'Lakes & reservoirs', length:[43,54], colors:['#dce2d8','#f1f0e2','#a5b4ac','#d4b558'], description:'A pale gull with gray wings, often seen gliding over lakes or following farm equipment.', behavior:'flying'},
  {name:'Black-billed magpie', scientific:'Pica hudsonia', category:'THE CURIOUS ONE', habitat:'Open country & towns', length:[45,60], colors:['#e5e9db','#303d39','#66847b','#303830'], description:'Bold black-and-white plumage and a long iridescent tail make this clever corvid unmistakable.', behavior:'tree'},
  {name:'Ring-necked pheasant', scientific:'Phasianus colchicus', category:'THE GRASSLAND SHOWSTOPPER', habitat:'Fields & grasslands', length:[53,89], colors:['#b27a4d','#4b6955','#e9ded0','#c5a960'], description:'The male’s coppery body, white neck ring and spectacular long tail stand out in grassland.', behavior:'ground'},
  {name:'Lark bunting', scientific:'Calamospiza melanocorys', category:'THE STATE BIRD', habitat:'Shortgrass prairie', length:[14,18], colors:['#343a34','#303832','#f2f1e4','#aeb9aa'], description:'Colorado’s state bird wears striking black and white in the breeding season and sings above the prairie.', behavior:'flying'},
  {name:'Mourning dove', scientific:'Zenaida macroura', category:'THE GENTLE VOICE', habitat:'Open woods & yards', length:[23,34], colors:['#bbaa94','#ad9b88','#e4d7c2','#665f53'], description:'A slender, soft-brown dove with a long pointed tail and a gentle, mournful coo.', behavior:'tree'},
];

const sceneEl = document.querySelector('#scene');
const listEl = document.querySelector('#bird-list');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c1b5');
scene.fog = new THREE.FogExp2('#b7c9b8', 0.012);
const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 200);
camera.position.set(0, 5.3, 18);
camera.lookAt(0, 3.2, -3);
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
sceneEl.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight('#f9f3dd', '#5f7661', 2.2));
const sun = new THREE.DirectionalLight('#fff2d6', 2.4);
sun.position.set(-7, 15, 10);
scene.add(sun);

const material = (color, extra={}) => new THREE.MeshStandardMaterial({color, roughness:0.9, ...extra});
const sphere = new THREE.SphereGeometry(1, 20, 14);
function shape(parent, color, position, scale, geometry=sphere, rotation=0) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.z = rotation;
  parent.add(mesh); return mesh;
}
function cylinder(parent, color, start, end, radius) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius*1.25, a.distanceTo(b), 7), material(color));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.sub(a).normalize());
  parent.add(mesh); return mesh;
}
function mountain(x, z, width, height, color, snow=true) {
  const columns=32, rows=12, positions=[], colors=[], indices=[];
  const rock=new THREE.Color(color), snowColor=new THREE.Color('#e3ebe0');
  for(let row=0;row<=rows;row++) {
    const depth=row/rows*2-1;
    for(let col=0;col<=columns;col++) {
      const horizontal=col/columns*2-1;
      const peaks=[
        {center:-.35,spread:.52,scale:.85},
        {center:.25,spread:.48,scale:1},
      ];
      const ridge=peaks.reduce((max,peak)=>Math.max(max,peak.scale*Math.exp(-(((horizontal-peak.center)/peak.spread)**2))),0);
      const rockiness=.92+.05*Math.sin(col*2.7+x*.7)+.04*Math.sin(col*1.3+row*2.1+z);
      const edge=Math.pow(Math.max(0,1-horizontal*horizontal),.35);
      const elevation=height*.8*ridge*edge*Math.pow(Math.max(0,1-Math.abs(depth)),.4)*rockiness;
      positions.push(horizontal*width,elevation,depth*width*.42);
      const snowline=.63+.1*Math.sin(col*1.8+row*.9+x);
      const shade=.83+.17*Math.sin(col*1.7+row*2.3+z);
      const vertexColor=rock.clone().multiplyScalar(shade);
      if(snow && elevation/(height*.8)>snowline) vertexColor.lerp(snowColor,.8);
      colors.push(vertexColor.r,vertexColor.g,vertexColor.b);
      if(row<rows && col<columns) {
        const a=row*(columns+1)+col, b=a+columns+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material('#ffffff',{flatShading:true,vertexColors:true,side:THREE.DoubleSide}));
  mesh.position.set(x,-1,z); scene.add(mesh);
}
mountain(-26,-39,19,17,'#91a99e'); mountain(-14,-42,18,23,'#9bafa3'); mountain(1,-43,18,20,'#819d92');
mountain(16,-40,17,24,'#95aa9d'); mountain(30,-43,19,16,'#829e91'); mountain(-32,-32,15,12,'#738e80',false);
mountain(28,-31,17,13,'#738d7e',false);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material('#9bad84'));
ground.rotation.x=-Math.PI/2; ground.position.y=-1; scene.add(ground);
const lake = new THREE.Mesh(new THREE.CircleGeometry(15, 50), material('#96b7af'));
lake.rotation.x=-Math.PI/2; lake.scale.set(1.7,.45,1); lake.position.set(0,-.96,-18); scene.add(lake);
function tree(x,z,s) {
  const group = new THREE.Group(); group.position.set(x,-1,z); group.scale.setScalar(s);
  cylinder(group,'#716953',[0,0,0],[0,3.8,0],.17);
  for(let i=0;i<3;i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5-i*.25,2.4,7), material(['#607d69','#698a70','#769579'][i],{flatShading:true}));
    cone.position.y=2+i*.9; group.add(cone);
  }
  scene.add(group);
}
[[-14,-8,1.3],[-11,-14,.85],[-18,-20,1.5],[-8,-24,1],[9,-19,.9],[13,-13,1.2],[17,-19,1.4],[23,-10,1.3],[-23,-5,1.4],[19,0,1.3]].forEach(t=>tree(...t));
// A foreground branch anchors the featured specimen in the landscape.
const branch = new THREE.Group();
cylinder(branch,'#75664f',[-1.9,-1.15,0],[2.6,-1.28,0],.09);
cylinder(branch,'#75664f',[1.1,-1.24,0],[1.8,-.7,.05],.045);
for(let i=0;i<12;i++){
  const x=-1.8+i*.35;
  shape(branch, i%2?'#799977':'#96ad83',[x,-1.08+Math.sin(i)*.12,.02],[.2,.08,.07],sphere,i%2?.5:-.5);
}
branch.position.set(1.2,3.05,0); scene.add(branch);

const meadowPatch = new THREE.Group();
shape(meadowPatch,'#91a879',[0,-1.47,0],[1.8,.12,.8]);
for(let i=0;i<13;i++) {
  const x=-1.5+i*.25, z=(i%3-1)*.18;
  cylinder(meadowPatch,i%2?'#728f66':'#b4bd8b',[x,-1.42,z],[x+.07,-1.15-(i%3)*.06,z],.018);
}
meadowPatch.position.set(1.3,3.05,0); scene.add(meadowPatch);

const noteCanvas=document.createElement('canvas');
noteCanvas.width=64; noteCanvas.height=64;
const noteContext=noteCanvas.getContext('2d');
noteContext.fillStyle='#f6f1da'; noteContext.font='48px serif'; noteContext.fillText('♪',12,48);
const noteTexture=new THREE.CanvasTexture(noteCanvas);
const songNotes=[0,1,2].map(()=>{
  const note=new THREE.Sprite(new THREE.SpriteMaterial({map:noteTexture,transparent:true,depthWrite:false}));
  note.scale.set(.34,.34,.34); scene.add(note); return note;
});

const birdHolder = new THREE.Group();
birdHolder.position.set(1.3,3.05,0); scene.add(birdHolder);
let featured, wings=[];
function makeBird(data, small=false) {
  const group = new THREE.Group();
  const [body,head,accent,beak]=data.colors;
  const isOwl=data.name.includes('owl'), isWater=/mallard|goose|pelican|cormorant/i.test(data.name);
  shape(group,body,[0,0,0],[.9,.61,.43],sphere,-.12);
  shape(group,accent,[.23,-.27,.25],[.52,.25,.19],sphere,.2);
  shape(group,head,[.66,.47,0],[.4,.4,.36]);
  // Eye and catchlight appear on both sides.
  for(const side of [-1,1]) {
    shape(group,isOwl?'#e7b95b':'#1f2c27',[.78,.53,side*.33],[isOwl?.115:.055,isOwl?.115:.055,.035]);
    if(isOwl) shape(group,'#252b25',[.8,.53,side*.36],[.043,.055,.02]);
    else shape(group,'#f8f5e5',[.8,.55,side*.36],[.016,.016,.01]);
  }
  const bill = new THREE.Mesh(new THREE.ConeGeometry(isWater?.14:.10,data.longBeak?.7:isWater?.38:.29,7),material(beak));
  bill.rotation.z=-Math.PI/2; bill.position.set(data.longBeak?1.26:1.04,.39,0); group.add(bill);
  if(data.crest) {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(.15,.43,5),material(head));
    crest.position.set(.56,.91,0); crest.rotation.z=.35; group.add(crest);
    if(isOwl){ const second=crest.clone(); second.position.x=.82; second.rotation.z=-.35; group.add(second); }
  }
  const tail = new THREE.Group(); tail.position.set(-.65,-.03,0); group.add(tail);
  for(let i=0;i<5;i++){
    const feather=shape(tail,head,[-.5,-.05,(i-2)*.1],[.65,.11,.08],sphere,(i-2)*.06);
    feather.rotation.y=(i-2)*.09;
  }
  if(data.fork) { tail.scale.x=1.5; }
  const localWings=[];
  for(const side of [-1,1]) {
    const wing = new THREE.Group(); wing.position.set(-.05,.17,side*.32); group.add(wing);
    shape(wing,head,[-.16,-.05,side*.08],[.65,.37,.16],sphere,-.3);
    for(let i=0;i<5;i++) {
      shape(wing, i===1?accent:head,[-.4-i*.09,-.13-i*.045,side*.12],[.43,.09,.055],sphere,-.35-i*.08);
    }
    localWings.push({wing,side});
  }
  if(data.behavior!=='flying') {
    for(const z of [-.2,.2]) {
      cylinder(group,beak,[.18,-.43,z],[.1,-.95,z],.025);
      cylinder(group,beak,[.1,-.95,z],[.38,-.97,z],.018);
    }
  }
  group.userData.wings=localWings;
  if(small) group.scale.setScalar(.3);
  return group;
}
const distantBirds=[];
for(let i=0;i<7;i++){
  const b=makeBird(birds[[5,10,11,18,21,24,2][i]],true);
  b.position.set(-12+i*4,5+(i%3)*1.3,-13-(i%2)*4); b.rotation.y=i%2?.2:Math.PI-.2;
  scene.add(b); distantBirds.push(b);
}

let selected=0, angle=0, dragging=false, previousX=0, verticalOffset=0;
const fields = Object.fromEntries(['index','category','name','scientific','description','habitat','length','size'].map(id=>[id,document.querySelector(`#bird-${id}`)]));
function selectBird(index) {
  selected=index;
  const bird=birds[index];
  if(featured) {
    birdHolder.remove(featured);
    featured.traverse(object=>{
      if(object.isMesh) {
        if(object.geometry!==sphere) object.geometry.dispose();
        object.material.dispose();
      }
    });
  }
  featured=makeBird(bird); birdHolder.add(featured); wings=featured.userData.wings;
  // A normalized close-up keeps every specimen legible; the field note gives its actual relative size.
  featured.scale.setScalar(bird.name==='American white pelican'?1.25:1.5);
  branch.visible=bird.behavior==='tree';
  meadowPatch.visible=bird.behavior==='ground';
  songNotes.forEach(note=>{note.visible=bird.behavior==='tree'});
  fields.index.textContent=`${String(index+1).padStart(2,'0')} / ${birds.length}`;
  fields.category.textContent=bird.category;
  fields.name.textContent=bird.name;
  fields.scientific.textContent=bird.scientific;
  fields.description.textContent=bird.description;
  fields.habitat.textContent=bird.habitat;
  fields.length.textContent=`${bird.length[0]}–${bird.length[1]} cm`;
  const ratio=(bird.length[0]+bird.length[1])/(birds[1].length[0]+birds[1].length[1]);
  fields.size.textContent=index===1?'The size comparison baseline':`About ${ratio.toFixed(1)}× a house sparrow`;
  document.querySelectorAll('.bird-card').forEach((card,i)=>{
    card.classList.toggle('active',i===index);
    card.setAttribute('aria-pressed',String(i===index));
  });
}
birds.forEach((bird,index)=>{
  const button=document.createElement('button');
  button.className='bird-card';
  button.setAttribute('aria-label',`View ${bird.name}`);
  button.style.setProperty('--bird-color',bird.colors[0]);
  button.style.setProperty('--bird-head',bird.colors[1]);
  button.style.setProperty('--bird-beak',bird.colors[3]);
  button.innerHTML=`<span class="card-number">${String(index+1).padStart(2,'0')} / ${birds.length}</span><span class="card-name">${bird.name}</span><span class="card-type">${bird.behavior==='flying'?'In flight':bird.behavior==='tree'?'In the trees':'On the ground'}</span><span class="card-art" aria-hidden="true"><i class="card-tail"></i><i class="card-beak"></i></span>`;
  button.addEventListener('click',()=>{
    selectBird(index);
    document.querySelector('.hero').scrollIntoView({behavior:'smooth'});
  });
  listEl.appendChild(button);
});
selectBird(0);
document.querySelector('#explore-button').addEventListener('click',()=>document.querySelector('#collection').scrollIntoView({behavior:'smooth'}));
const dialog=document.querySelector('#about-dialog');
document.querySelector('#about-button').addEventListener('click',()=>dialog.showModal());
document.querySelector('#close-about').addEventListener('click',()=>dialog.close());
document.querySelector('#done-about').addEventListener('click',()=>dialog.close());
renderer.domElement.addEventListener('pointerdown',event=>{dragging=true;previousX=event.clientX;renderer.domElement.setPointerCapture(event.pointerId)});
renderer.domElement.addEventListener('pointermove',event=>{if(dragging){angle+=(event.clientX-previousX)*.008;previousX=event.clientX}});
renderer.domElement.addEventListener('pointerup',()=>{dragging=false});
renderer.domElement.addEventListener('pointercancel',()=>{dragging=false});
function resize() {
  const {clientWidth,clientHeight}=sceneEl;
  renderer.setSize(clientWidth,clientHeight,false);
  camera.aspect=clientWidth/clientHeight; camera.updateProjectionMatrix();
  verticalOffset=clientWidth<640?-1.2:0;
  birdHolder.position.y=branch.position.y=meadowPatch.position.y=3.05+verticalOffset;
  if(clientWidth<640){camera.position.set(-1.6,5.3,21);camera.lookAt(0,3.4,-3)}
  else {camera.position.set(0,5.3,18);camera.lookAt(0,3.2,-3)}
}
window.addEventListener('resize',resize); resize();
const clock=new THREE.Clock();
function animate() {
  const t=clock.getElapsedTime();
  birdHolder.rotation.y=angle+.13+Math.sin(t*.3)*.035;
  featured.position.y=birds[selected].behavior==='flying'?Math.sin(t*2)*.08:Math.sin(t*1.3)*.015;
  featured.rotation.z=birds[selected].behavior==='ground'?-.12*Math.max(0,Math.sin(t*2.2)):0;
  wings.forEach(({wing,side})=>{wing.rotation.x=birds[selected].behavior==='flying'?side*(.35+Math.sin(t*5)*.45):0});
  songNotes.forEach((note,i)=>{
    const phase=(t*.35+i/3)%1;
    note.position.set(2.8+phase*.6,4.0+verticalOffset+phase*.9,0);
    note.material.opacity=Math.sin(phase*Math.PI)*.8;
  });
  distantBirds.forEach((bird,i)=>{
    bird.position.x+=Math.sin(t*.3+i)*.003;
    bird.userData.wings.forEach(({wing,side})=>wing.rotation.x=side*(.3+Math.sin(t*4+i)*.35));
  });
  renderer.render(scene,camera); requestAnimationFrame(animate);
}
animate();
