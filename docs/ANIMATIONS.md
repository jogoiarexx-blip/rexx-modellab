# ModelLab 0.12 — Biblioteca de animações
Nove clips procedurais reutilizáveis para personagens com rig ModelLab: idle, walk, run, jump, crouch, attack, hit, death e aim. Movimentos em repouso local (in-place), sem deslocamento da raiz ou física. O jogo controla deslocamento, altura do salto, colisão e estado; poses de agachar e morrer não garantem contato com o chão. Não são animações capturadas nem retargeting Mixamo.
```sh
node cli/modellab.js animations
node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --animations all --out personagem.glb
node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --animations idle,walk,run --out locomocao.glb
node cli/modellab.js animation-preview personagem.modellab.json --rig personagem.rig.json --clip walk --time 0.25 --out revisao
node cli/modellab.js validate personagem.glb
```
Os clips usam quaternions normalizados e interpolação linear glTF. O exportador inclui tracks para todos os ossos; a metadata extras.loop é informativa, o jogo configura LoopRepeat ou LoopOnce. A API blendPoses permite mistura de duas poses por slerp; no Three.js use AnimationMixer e crossFadeTo para transições em tempo real. 
```js
const mixer = new THREE.AnimationMixer(gltf.scene);
const idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'idle'));
const walk = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'walk'));
idle.play();
// Ao mudar de estado:
walk.reset().play();
idle.crossFadeTo(walk, 0.2, false);
// A cada frame: mixer.update(deltaSeconds);
```
O validador verifica tempos, canais, quaternions e reimportação dos clips via Three.js. A API exportGLB também inicializa FileReader no Node.js. Ainda não há editor visual de timeline nem importação de animações externas. Revise movimentos nos personagens reais antes de publicar um jogo.
