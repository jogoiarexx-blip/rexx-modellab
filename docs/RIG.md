# ModelLab 0.10 — Auto Rig
Cria um esqueleto humanoide de repouso para uma malha em pose T, sem dependências novas. São 26 ossos/articulações: quadril, coluna, tórax, pescoço, cabeça, extremidade da cabeça, clavículas, braços, antebraços, mãos, extremidades das mãos, coxas, pernas, pés e pontas dos pés. Esquerda/direita anatômica assume frente +Z (esquerda do personagem em +X).
```sh
node cli/modellab.js rig personagem.modellab.json --id character --out personagem.rig.json
node cli/modellab.js rig-preview personagem.modellab.json --rig personagem.rig.json --out rig-revisao
node cli/modellab.js rig-edit personagem.rig.json --ops joints.json --out corrigido.rig.json
```
O arquivo rig.json é um sidecar independente, não modifica a geometria nem o schema do projeto. Cada osso tem position (coordenada absoluta local da malha), parent e localPosition (relativa ao pai, sem rotação de repouso). Todas em metros antes da transformação da peça; hierarquia pai antes dos filhos. Ajustes são um objeto nome -> [x,y,z] nas mesmas coordenadas. Copie as posições existentes para editar; não utilize coordenadas de tela. O preview sobrepõe linhas ciano e articulações amarelas a PNGs frontais, laterais e isométricos. A sobreposição é sempre visível, não ocluída pela malha.
A detecção usa contorno T e envelope de profundidade; em malhas refinadas sem contorno usa proporções aproximadas. Não é um detector neural, não estima dedos individuais e pode falhar em poses distintas. O rig ainda não está vinculado à malha nem incluído no GLB; skinning e exportação de ossos serão tratados na 0.11. Ainda não há novos controles na interface gráfica.
API: autoRig(project,id,{joints}), adjustRig(rig,joints), validateRig(rig), previewRig(project,rig,{size,views}). Teste com npm test.
