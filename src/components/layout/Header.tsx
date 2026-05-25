import { Bell } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useLangStore } from '../../store/langStore'
import { formatDate } from '../../utils/date'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  const { user } = useAuthStore()
  const { lang, toggle } = useLangStore()

  const dateStr = formatDate(new Date(), lang)

  return (
    <header className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between flex-shrink-0">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 hidden md:block">{dateStr}</span>

        {/* Language toggle */}
        <button
          onClick={toggle}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold
            text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors tracking-wide"
          title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
        >
          {lang === 'ar' ? 'EN' : 'عر'}
        </button>

        <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell size={20} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden md:block">
            {user?.username}
          </span>
        </div>
      </div>
    </header>
  )
}
