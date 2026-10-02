const renderExerciseTrend = (
  exercise: TopExercise,
  idx: number
) => {
  const e1rmPositive =
    exercise.percentChange >
    0;

  const e1rmNegative =
    exercise.percentChange <
    0;

  const volumePositive =
    exercise.volumeChange >
    0;

  const volumeNegative =
    exercise.volumeChange <
    0;

  return (
    <div
      key={`${exercise.exerciseName}-${idx}`}
      className="flex items-center justify-between gap-3 text-xs py-1.5 border-t border-border/20 first:border-0"
    >
      <span className="text-foreground truncate min-w-0 flex-1">
        {exercise.exerciseName}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={
            e1rmPositive
              ? "text-emerald-500 font-semibold"
              : e1rmNegative
                ? "text-rose-500 font-semibold"
                : "text-muted-foreground font-semibold"
          }
        >
          {exercise.percentChange > 0 ? "+" : ""}
          {exercise.percentChange}%
        </span>

        <span
          className={
            volumePositive
              ? "text-emerald-500 font-semibold"
              : volumeNegative
                ? "text-rose-500 font-semibold"
                : "text-muted-foreground font-semibold"
          }
        >
          {exercise.volumeChange > 0 ? "+" : ""}
          {exercise.volumeChange}%
        </span>
      </div>
    </div>
  );
};