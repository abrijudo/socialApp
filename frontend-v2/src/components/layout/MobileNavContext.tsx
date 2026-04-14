import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type MobileNavContextValue = {
  openNavSheet: () => void
  openMembersSheet: () => void
  showMembersButton: boolean
  navSheetOpen: boolean
  setNavSheetOpen: (open: boolean) => void
  membersSheetOpen: boolean
  setMembersSheetOpen: (open: boolean) => void
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null)

export function MobileNavProvider({
  children,
  showMembersButton,
}: {
  children: ReactNode
  showMembersButton: boolean
}) {
  const [navOpen, setNavOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)

  const openNavSheet = useCallback(() => setNavOpen(true), [])
  const openMembersSheet = useCallback(() => setMembersOpen(true), [])

  useEffect(() => {
    if (!showMembersButton) setMembersOpen(false)
  }, [showMembersButton])

  const value = useMemo(
    () => ({
      openNavSheet,
      openMembersSheet,
      showMembersButton,
      navSheetOpen: navOpen,
      setNavSheetOpen: setNavOpen,
      membersSheetOpen: membersOpen,
      setMembersSheetOpen: setMembersOpen,
    }),
    [openNavSheet, openMembersSheet, showMembersButton, navOpen, membersOpen],
  )

  return (
    <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
  )
}

export function useMobileNav(): MobileNavContextValue | null {
  return useContext(MobileNavContext)
}
