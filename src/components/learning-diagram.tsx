import React from "react";
import { View } from "react-native";
import Svg, { Line, Circle, Text as SvgText } from "react-native-svg";
import type { LearningDiagram as Diagram } from "@/domain/model";
import { AppText } from "./ui";
import { colors, neumorphic } from "@/theme";
export function LearningDiagram({ diagram }: { diagram: Diagram }) {
  if (diagram.type === "fraction") {
    const d = diagram.denominator ?? 0,
      n = diagram.numerator ?? 0;
    if (
      !Number.isInteger(d) ||
      d < 1 ||
      d > 24 ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > d
    )
      return null;
    return (
      <View
        accessibilityLabel={`${n} part${n === 1 ? " coloriée" : "s coloriées"} sur ${d}`}
        style={{ gap: 12 }}
      >
        <View
          style={{
            flexDirection: "row",
            height: 70,
            borderRadius: 16,
            overflow: "hidden",
            ...neumorphic.inset,
          }}
        >
          {Array.from({ length: d }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                borderRightWidth: 2,
                borderRightColor: colors.surface,
                backgroundColor: i < n ? colors.primary : colors.surfaceInset,
              }}
            />
          ))}
        </View>
        <AppText variant="small">
          {n} / {d} · {n} part{n === 1 ? "" : "s"} sur {d}
        </AppText>
      </View>
    );
  }
  const min = diagram.min ?? -5,
    max = diagram.max ?? 5;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const points = (diagram.points ?? []).filter(
    (p) => Number.isFinite(p.value) && p.value >= min && p.value <= max,
  );
  const x = (value: number) => 35 + ((value - min) / (max - min)) * 530;
  const ticks = Array.from(
    { length: 11 },
    (_, i) => min + ((max - min) * i) / 10,
  );
  return (
    <View
      accessibilityLabel={points
        .map((p) => `${p.label} : ${p.value}`)
        .join(", ")}
    >
      <Svg width="100%" height={140} viewBox="0 0 600 140">
        <Line
          x1={35}
          x2={565}
          y1={72}
          y2={72}
          stroke={colors.muted}
          strokeWidth={2}
        />
        {ticks.map((v) => (
          <React.Fragment key={v}>
            <Line
              x1={x(v)}
              x2={x(v)}
              y1={65}
              y2={79}
              stroke={colors.muted}
              strokeWidth={2}
            />
            <SvgText
              x={x(v)}
              y={104}
              textAnchor="middle"
              fill={colors.ink}
              fontSize={15}
            >
              {Number(v.toFixed(2))}
            </SvgText>
          </React.Fragment>
        ))}
        {points.map((p, i) => (
          <React.Fragment key={i}>
            <Circle cx={x(p.value)} cy={72} r={6} fill={colors.primary} />
            <SvgText
              x={x(p.value)}
              y={i % 2 ? 32 : 50}
              textAnchor="middle"
              fill={colors.primary}
              fontSize={16}
            >
              {p.label}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}
