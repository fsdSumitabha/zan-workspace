"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { FolderKanban, Home, Users, UserRoundCog, Handshake } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import styles from "./OperationsMobileNav.module.css"

const navItems: Array<{
  name: string
  href: string
  roles: number[]
  icon: React.ComponentType<{ size?: number | string }>
}> = [
  { name: "Dashboard", href: "/admin/operations", roles: [10, 20, 30, 40, 50, 60, 70, 80], icon: Home },
  { name: "Leads", href: "/admin/operations/leads", roles: [10, 20, 30, 40, 50, 60, 70, 80], icon: Users },
  { name: "Clients", href: "/admin/operations/clients", roles: [10, 20, 30, 40, 50, 60, 70, 80], icon: Handshake },
  { name: "Projects", href: "/admin/operations/projects", roles: [10, 20, 30, 40, 50, 60, 70, 80], icon: FolderKanban },
  { name: "Users", href: "/admin/operations/users", roles: [10, 20], icon: UserRoundCog },
]

export default function OperationsMobileNav() {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [visible, setVisible] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [gapPx, setGapPx] = useState(0)
  const lastY = useRef(0)
  const raf = useRef<number | null>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    lastY.current = window.scrollY
    const onScroll = () => {
      if (raf.current) return
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null
        const y = window.scrollY
        const delta = y - lastY.current
        if (Math.abs(delta) > 8) {
          if (delta > 0 && y > 64) setVisible(false)
          if (delta < 0) setVisible(true)
        }
        lastY.current = y
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf.current) window.cancelAnimationFrame(raf.current)
    }
  }, [])

  const filtered = useMemo(() => {
    if (!user) return []
    return navItems.filter(i => i.roles.includes(user.role))
  }, [user])

  useEffect(() => {
    const currentIndex = filtered.findIndex(item =>
      item.href === "/admin/operations"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + "/")
    )
    if (currentIndex !== -1) setActiveIndex(currentIndex)
  }, [pathname, filtered])

  // Measure the live gap between two adjacent items so the indicator
  // animation lands exactly under the active item across screen sizes.
  useLayoutEffect(() => {
    const calc = () => {
      const ul = menuRef.current
      if (!ul) return
      const links = ul.querySelectorAll<HTMLAnchorElement>("a")
      if (links.length < 2) {
        setGapPx(0)
        return
      }
      const a = links[0].getBoundingClientRect()
      const b = links[1].getBoundingClientRect()
      setGapPx(Math.max(0, b.left - a.right))
    }
    calc()
    window.addEventListener("resize", calc)
    return () => window.removeEventListener("resize", calc)
  }, [filtered.length])

  if (loading || !user || filtered.length === 0) return null

  return (
    <>
      {/* Bottom safe-area spacer so page content isn't hidden behind the fixed nav */}
      {/* <div className="md:hidden h-[100px]" aria-hidden="true" /> */}

      <nav
        className={`md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[500px] transition-transform duration-300 ${
          // translate-y-full alone only hides the nav body — the floating
          // indicator's top half (top: -50%) and the hood (40px above the
          // nav) would still be visible. Add ~50px of extra travel so the
          // entire cluster, including the indicator's halo, is pushed
          // fully below the viewport edge.
          visible ? "translate-y-0" : "translate-y-[calc(100%+50px)]"
        }`}
        aria-label="Mobile navigation"
      >
        <div className={styles.bottomNav}>
          {/* Frosted backdrop that extends above the nav so scrolled content
              never clashes with the floating indicator's halo. */}
          <div className={styles.hood} aria-hidden="true" />

          <div
            className={styles.indicator}
            style={{
              ["--item" as string]: activeIndex,
              ["--gap" as string]: `${gapPx}px`,
            } as React.CSSProperties}
            aria-hidden="true"
          />

          <ul ref={menuRef} className={styles.menu}>
            {filtered.map((item, index) => {
              const isActive = index === activeIndex
              const Icon = item.icon

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={isActive ? styles.active : ""}
                    onClick={() => setActiveIndex(index)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className={styles.icon}>
                      <Icon size={22} />
                    </span>
                    <span className={styles.text}>{item.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>
    </>
  )
}
