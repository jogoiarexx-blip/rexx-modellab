# REXX-TRAIN-07 — Transferência de movimento Mixamo (FBX)
Foram reabertos os três ZIPs Running do lote original. Todos contêm FBX binário 7400, um AnimationStack Running, uma camada, 20 amostras a 30 FPS, de 0 a 29.251.233.400 ticks FBX (19/30 s). Crimson Vixen e Blue Line Guardian contêm 144 AnimationCurves cada; Tactical Shadow contém 384. Os arquivos têm respectivamente 31, 33 e 67 entradas PoseNode na pose bind. As matrizes de repouso dos braços não equivalem a uma pose T universal. Não foram publicados os arquivos ou as curvas originais.
 
## Uso
Extraia o FBX do ZIP localmente.
```sh
node cli/modellab.js retarget Running.fbx --rig personagem.rig.json --out corrida.clip.json --report retarget.json --fps 30
node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --motion corrida.clip.json --animations idle,walk --out animado.glb
```
O importador lê exclusivamente hierarquia, curvas, propriedades de transformação e matrizes de bind. O retarget reconhece nomes Mixamo, inclusive dedos, usa orientação global e alinhamento de segmentos com o rig destino (cujo repouso tem rotações identidade); usa bind quando disponível para aproximar a torção e corrige a direção final. As rotações locais são exportadas em quaternions com continuidade de sinal. O comprimento do esqueleto destino permanece inalterado. Movimento in-place, sem translação de raiz. --yaw permite ajuste de orientação global. O JSON resultante pode ser reutilizado no mesmo rig; para outro rig, execute retarget novamente.
 
Limites: primeira implementação para FBX 7400 binário, uma camada baked, escalas unitárias, sem pivôs especiais. Não é um importador FBX geral; não implementa curvas cúbicas, constraints, IK, foot locking, root motion, retarget exato de torção ou validação visual de corrida. Segmentos sem correspondência herdam a rotação do pai. O teste sintético verifica movimento de perna, exportação GLB e validação; a execução com os três FBXs reais precisa ser confirmada separadamente. Interface web não alterada.
