import { useCallback, useMemo, useReducer } from 'react'
import { cloneSnapshot } from '../pattern/ops'
import type { PatternSnapshot } from '../pattern/types'

const MAX_HISTORY = 50
const EMPTY_SNAPSHOT: PatternSnapshot = { pattern: [], palette: [] }

type HistoryState = {
  snapshot: PatternSnapshot
  past: PatternSnapshot[]
  future: PatternSnapshot[]
}

type HistoryAction =
  | { type: 'reset'; snapshot: PatternSnapshot }
  | { type: 'commit'; snapshot: PatternSnapshot }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'set-snapshot'; snapshot: PatternSnapshot }

const initialState: HistoryState = {
  snapshot: EMPTY_SNAPSHOT,
  past: [],
  future: [],
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'reset':
      return {
        snapshot: cloneSnapshot(action.snapshot),
        past: [],
        future: [],
      }
    case 'commit':
      return {
        snapshot: cloneSnapshot(action.snapshot),
        past: [...state.past.slice(-(MAX_HISTORY - 1)), cloneSnapshot(state.snapshot)],
        future: [],
      }
    case 'undo': {
      if (!state.past.length) return state
      const previous = state.past[state.past.length - 1]
      return {
        snapshot: cloneSnapshot(previous),
        past: state.past.slice(0, -1),
        future: [...state.future, cloneSnapshot(state.snapshot)],
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      const next = state.future[state.future.length - 1]
      return {
        snapshot: cloneSnapshot(next),
        past: [...state.past, cloneSnapshot(state.snapshot)],
        future: state.future.slice(0, -1),
      }
    }
    case 'set-snapshot':
      return {
        ...state,
        snapshot: cloneSnapshot(action.snapshot),
      }
    default:
      return state
  }
}

export function usePatternHistory() {
  const [state, dispatch] = useReducer(historyReducer, initialState)

  const reset = useCallback((next: PatternSnapshot) => {
    dispatch({ type: 'reset', snapshot: next })
  }, [])

  const commit = useCallback((next: PatternSnapshot) => {
    dispatch({ type: 'commit', snapshot: next })
  }, [])

  const undo = useCallback(() => {
    dispatch({ type: 'undo' })
  }, [])

  const redo = useCallback(() => {
    dispatch({ type: 'redo' })
  }, [])

  const setSnapshotOnly = useCallback((next: PatternSnapshot) => {
    dispatch({ type: 'set-snapshot', snapshot: next })
  }, [])

  return useMemo(() => ({
    pattern: state.snapshot.pattern,
    palette: state.snapshot.palette,
    reset,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    setSnapshot: setSnapshotOnly,
  }), [state, reset, commit, undo, redo, setSnapshotOnly])
}
