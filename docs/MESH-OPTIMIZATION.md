# REXX-TRAIN-06 — Limpeza e simplificação conservadora
Análise direta dos quatro GLB enviados: contagem de vértices, posições distintas e combinações distintas de POSITION, NORMAL, TEXCOORD_0, JOINTS_0 e WEIGHTS_0 (igualdade numérica exata, sem alterar o arquivo).
 
| Modelo | Vértices | Posições únicas | Atributos completos únicos |
|---|---:|---:|---:|
| Crimson Corsair | 20641 | 4526 | 20628 |
| Denim Confidence | 194071 | 147921 | 194071 |
| Harbinger of Decay | 21981 | 5026 | 21971 |
| Rustbound Threshold | 1434 | 430 | 1434 |
 
Conclusão: soldar somente por XYZ destruiria diferenças importantes de UV, normais e skin. O novo algoritmo opera sobre o formato editável estático do ModelLab, não sobre os GLBs originais com pesos. Deduplica combinações idênticas de posição, UV e normal; elimina faces degeneradas, duplicatas de mesma orientação e vértices não utilizados. A simplificação por colapso de aresta escolhe arestas curtas, protege fronteiras, costuras, quinas e regiões de juntas opcionais, testa orientação geométrica e UV e a condição de ligação local. Mantém posições e atributos dos vértices sobreviventes. Pode parar antes da meta, especialmente em malhas com muitas costuras. Não promete fidelidade visual absoluta.
 
```sh
node cli/modellab.js optimize personagem.modellab.json --id character --preset mobile --rig personagem.rig.json --out leve.modellab.json --report mesh-report.json
node cli/modellab.js build leve.modellab.json --rig personagem.rig.json --out leve.glb
```
Opções via --ops: {"ratio":0.65,"maxRounds":8,"maxEdge":0.045,"uvTolerance":0.035,"protectRadius":0.035}. A meta do preset vale para cada malha selecionada. Use targetTriangles para meta explícita ou ratio para proporção. A escala do raio de proteção é a diagonal da caixa da geometria armazenada. Recomenda-se inspeção de render e pose. Sem --rig, não há proteção específica de juntas. Não se aplica a perfis até convertê-los em mesh via refine.
 
Limites: não é retopologia quadrangular, boolean union, transferência de skin existente ou simplificação de FBX/GLB acima dos limites de importação atuais. Não solda os componentes sobrepostos das mãos em uma superfície única. Não redimensiona texturas (comando texture separado). A interface web não foi alterada. Os modelos originais não foram publicados.
