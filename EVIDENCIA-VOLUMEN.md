# De dónde salen los números del mapa muscular

Este documento existe para que dentro de seis meses nadie —ni tú, ni un agente
leyendo el repo— confunda **lo que está medido** con **lo que es una heurística
de dosificación**. Los umbrales que pinta el card (`MUSCLE_DEFS` en
`src/main/muscles.ts`) vienen de tres capas muy distintas en solidez.

## Lo primero, para que quede claro

**Ninguno de los estudios de abajo produjo los números por músculo del card.**
No existe un paper que diga "el MEV del pecho son 8 series". Los landmarks son
un *marco de dosificación* calibrado por entrenadores sobre literatura de
dosis-respuesta. Los estudios sostienen la **forma de la curva** (más series →
más hipertrofia, con rendimientos decrecientes); los números concretos son
estimaciones.

El card es una guía de dosis. El medidor de crecimiento sigue siendo la cinta
métrica, el InBody y las cargas subiendo en Hevy.

---

## Capa 1 — El marco de landmarks (de aquí salen los números)

**Israetel M, Case J, Davis J.** *Scientific Principles of Hypertrophy
Training.* Renaissance Periodization, 2019. — Origen de la terminología
MEV / MAV / MRV. También en los artículos de volume landmarks de RP.

Nivel de evidencia: **marco de experto**, no medición. Es consistente con la
literatura de dosis-respuesta pero sus valores por músculo no fueron obtenidos
experimentalmente.

> Nota honesta: la tabla en `MUSCLE_DEFS` es mi transcripción y calibración en
> el espíritu de ese marco, no una copia de valores publicados. Grupos como
> aductores, erectores y agarre los estimé por analogía con músculos de tamaño
> y tolerancia parecidos.

---

## Capa 2 — Dosis-respuesta de volumen (lo que sí está medido)

**Schoenfeld BJ, Ogborn D, Krieger JW (2017).** "Dose-response relationship
between weekly resistance training volume and increases in muscle mass: A
systematic review and meta-analysis." *Journal of Sports Sciences*,
35(11), 1073-1082. [PMID 27433992](https://pubmed.ncbi.nlm.nih.gov/27433992/)

> 34 grupos de tratamiento, 15 estudios. Cada serie semanal adicional se asoció
> a un aumento del tamaño del efecto de 0.023, ≈ **+0.37% de ganancia por serie
> por semana**. Relación graduada: <5, 5-9 y 10+ series/semana en escalera.
> Este es el paper que sostiene "más series → más músculo".

**Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC.** "The Resistance
Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume
and Frequency on Muscle Hypertrophy and Strength Gains." *Sports Medicine*
(2026). [DOI 10.1007/s40279-025-02344-w](https://link.springer.com/article/10.1007/s40279-025-02344-w)
· [PMID 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/) · preprint previo
en [SportRxiv](https://sportrxiv.org/index.php/server/preprint/view/460) (2024)

> El más importante para leer el card con escepticismo. Meta-regresión bayesiana
> grande, clasificando series como directas o indirectas. **La hipertrofia sigue
> subiendo con más volumen, con rendimientos decrecientes; la fuerza se aplana
> mucho antes.** No aparece la caída clara que el concepto de MRV implicaría —
> por eso la zona roja del card debe leerse como aviso de fatiga acumulada, no
> como un acantilado de crecimiento demostrado.

**Aube D, Wadhi T, Rauch J, et al. (2022).** "Progressive Resistance Training
Volume: Effects on Muscle Thickness, Mass, and Strength Adaptations in
Resistance-Trained Individuals." *Journal of Strength and Conditioning
Research*, 36(3), 600-607. [PMID 32058362](https://pubmed.ncbi.nlm.nih.gov/32058362/)

> 12 vs 18 vs 24 series semanales de tren inferior, 8 semanas, sujetos que
> sentadillan >2× su peso corporal. **Sin diferencias en grosor muscular entre
> los tres grupos.** La razón por la que el tramo alto del rango compra poco:
> la diferencia entre 13 y 17 series es mucho menor que entre 4 y 13.

**Baz-Valle E, Fontes-Villalba M, Santos-Concejero J (2021).** "Total Number of
Sets as a Training Volume Quantification Method for Muscle Hypertrophy: A
Systematic Review." *JSCR*, 35(3), 870-878.
[PMID 30063555](https://pubmed.ncbi.nlm.nih.gov/30063555/)

> Contar series (cerca del fallo, rango 6-20+ reps) es un método válido para
> cuantificar volumen. Justifica que el card cuente **series**, no tonelaje.

---

## Capa 3 — Recuperación y frecuencia (sostiene el card de readiness)

**Damas F, Phillips SM, Libardi CA, et al. (2016).** "Resistance
training-induced changes in integrated myofibrillar protein synthesis are
related to hypertrophy only after attenuation of muscle damage." *The Journal
of Physiology*, 594. [DOI 10.1113/JP272472](https://physoc.onlinelibrary.wiley.com/doi/10.1113/JP272472)
· [PMC5023708](https://pmc.ncbi.nlm.nih.gov/articles/PMC5023708/)

> Curso temporal de síntesis proteica y daño muscular a lo largo de semanas 1, 3
> y 10. La hipertrofia real aparece cuando el daño se atenúa. Base conceptual
> de por qué el descanso escala con el daño de la sesión.

**Schoenfeld BJ, Ogborn D, Krieger JW (2016).** "Effects of Resistance Training
Frequency on Measures of Muscle Hypertrophy: A Systematic Review and
Meta-Analysis." *Sports Medicine*, 46(11), 1689-1697.
[DOI 10.1007/s40279-016-0543-8](https://link.springer.com/article/10.1007/s40279-016-0543-8)

> Entrenar un grupo **2× por semana** supera a 1× a volumen igualado. Es el
> techo superior de las horas base de recuperación: si 72h entre sesiones
> funciona mejor que 168h, el modelo no puede pedir 5 días de descanso.

---

## Capa 4 — Cómo entrenar las series (respalda tu plan actual)

**Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ (2023).** "Influence of
Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A
Systematic Review with Meta-analysis." *Sports Medicine*.
[PMID 36334240](https://pubmed.ncbi.nlm.nih.gov/36334240/)

> Relación potencialmente **no lineal** entre cercanía al fallo e hipertrofia.
> Sostiene la regla de tu plan: última serie de aislamientos al fallo,
> compuestos con 1-2 en reserva.

**Maeo S, Huang M, Wu Y, et al. (2021).** "Greater Hamstrings Muscle Hypertrophy
but Similar Damage Protection after Training at Long versus Short Muscle
Lengths." *Medicine & Science in Sports & Exercise*, 53(4), 825-837 (online
2020). [DOI 10.1249/MSS.0000000000002523](https://doi.org/10.1249/MSS.0000000000002523)

> Leg curl **sentado vs. tumbado**, 12 semanas, una pierna cada uno, MRI. El
> sentado (isquio en posición larga por la flexión de cadera) creció más en
> semimembranoso, semitendinoso y bíceps femoral (cabeza larga). Es el respaldo
> directo de "prioriza el leg curl SENTADO" de tu plan de cadena posterior.

---

## Capa 5 — Lo que NO tiene respaldo: heurísticas mías

Esto es invención propia. Es razonada, pero si alguien pregunta "¿de dónde sale
esto?", la respuesta honesta es "de mi criterio":

| Heurística | Dónde vive | Qué es |
|---|---|---|
| Pesos de series efectivas (1 / 0.75 / 0.5 / 0.25 por implicación) | `MUSCLE_RULES` | Contar volumen indirecto como parcial tiene apoyo conceptual (ver Baz-Valle 2021, que distingue directo de indirecto); **los pesos exactos son míos** |
| Horas base de recuperación por músculo | `MUSCLE_DEFS.recovery` | Estimaciones calibradas contra el rango 24-72h de la literatura de daño/frecuencia |
| Curva de dosis con raíz cuadrada | `recoveryHoursFor` | Forma elegida para que el doble de series no pida el doble de descanso; el exponente no está medido |
| Multiplicador de intensidad ×1.15 (RPE≥9 o ≤3 reps) | `recoveryHoursFor` | Criterio propio |
| Ponderación de prioridad 3/2/1 en el readiness global | `PRIORITY_WEIGHT` | Preferencia de presentación, no fisiología |

---

## Cómo leer el card con esto en la cabeza

1. **Cruzar el MEV no enciende nada.** Es una curva continua, no un interruptor.
   El MEV marca dónde la dosis empieza a ser confiablemente rentable.
2. **El tramo alto compra poco.** Ir de MAV a MRV cuesta mucha fatiga por poca
   hipertrofia extra (Aube 2022), y esa fatiga compite con tus básicos.
3. **El rojo del MRV es la parte más débil del marco.** Léelo como "esto no lo
   vas a sostener semana tras semana", no como "aquí dejas de crecer".
4. **La variación individual es enorme.** El card no conoce *tu* MEV; conoce el
   de un levantador entrenado promedio.
