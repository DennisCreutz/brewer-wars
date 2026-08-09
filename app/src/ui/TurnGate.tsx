import type { ReactNode } from 'react'

/**
 * Gates a phase's action UI behind "does the signed-in member actually
 * have something to do right now?" — the caller computes `isMyTurn` (e.g.
 * "my own player entry isn't done yet"), this just picks which of two
 * subtrees to render.
 *
 * This replaces the old single-device "pass the device" hot-seat curtain
 * (HotSeatGate). Nothing in the domain reducer enforces players acting in
 * a fixed order (see domain/war.ts's docs on DRAW_PERSONAL_MODIFIER etc),
 * so now that every `Player` is bound to a real signed-in account
 * (`Player.userId`) and everyone has their own device, there's no reason
 * to force a queue: several members can genuinely be mid-turn at once,
 * each only ever seeing their own action screen. Whoever isn't due to act
 * sees `waiting` instead — typically a summary of who's still pending.
 */
export function TurnGate({
  isMyTurn,
  waiting,
  children,
}: {
  isMyTurn: boolean
  waiting: ReactNode
  children: ReactNode
}) {
  return isMyTurn ? <>{children}</> : <>{waiting}</>
}
