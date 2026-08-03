import { useTranslation } from 'react-i18next'
import { NumberField } from '../NumberField'

// No hard domain constraint on points (unlike the modifier deck counts) —
// these are just sane UI bounds for a "points per X" integer.
export const POINTS_MIN = 0
export const POINTS_MAX = 10

interface PointsStepProps {
  winPoints: number
  votePoints: number
  onWinPointsChange: (points: number) => void
  onVotePointsChange: (points: number) => void
}

/** Step 4: win points and best-brewer vote points. */
export function PointsStep({
  winPoints,
  votePoints,
  onWinPointsChange,
  onVotePointsChange,
}: PointsStepProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
      <NumberField
        id="win-points"
        label={t('wizard.points.winPoints')}
        value={winPoints}
        min={POINTS_MIN}
        max={POINTS_MAX}
        onChange={onWinPointsChange}
      />
      <NumberField
        id="vote-points"
        label={t('wizard.points.votePoints')}
        value={votePoints}
        min={POINTS_MIN}
        max={POINTS_MAX}
        onChange={onVotePointsChange}
      />
    </div>
  )
}
