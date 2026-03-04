import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategorizeTransactions } from '@/components/categories/CategorizeTransactions';

export default function CategoriesPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl text-accent">Catégories</h1>

      <Tabs defaultValue="categorize">
        <TabsList>
          <TabsTrigger value="list">Mes catégories</TabsTrigger>
          <TabsTrigger value="categorize">Catégoriser mes transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <div className="bg-card rounded-[20px] shadow-soft p-12 flex items-center justify-center">
            <p className="text-muted-foreground">Gestion des catégories — à venir</p>
          </div>
        </TabsContent>

        <TabsContent value="categorize" className="mt-6">
          <CategorizeTransactions />
        </TabsContent>
      </Tabs>
    </div>
  );
}
