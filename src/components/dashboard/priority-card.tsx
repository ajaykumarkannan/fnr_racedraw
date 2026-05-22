import { Card, CardContent } from '@/components/ui/card'

interface PriorityCardProps {
  priority: number
}

export function PriorityCard({ priority }: PriorityCardProps) {
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Overflow Priority</p>
            <p className="text-2xl font-bold">{priority}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground max-w-[200px]">
            {priority > 0
              ? 'You have priority in the next draw. Higher priority = paired first.'
              : 'No accumulated priority. You were paired in your last draw or haven\'t been overflowed.'}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
