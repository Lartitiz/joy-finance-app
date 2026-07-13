import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategorizeTransactions } from '@/components/categories/CategorizeTransactions';
import { CategoryList } from '@/components/categories/CategoryList';
import { CategorizationRules } from '@/components/categories/CategorizationRules';

export default function CategoriesPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl text-accent">Catégories</h1>

      <Tabs defaultValue="categorize">
        <TabsList>
          <TabsTrigger value="list">Mes catégories</TabsTrigger>
          <TabsTrigger value="categorize">Catégoriser mes transactions</TabsTrigger>
          <TabsTrigger value="rules">Mes règles</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <CategoryList />
        </TabsContent>

        <TabsContent value="categorize" className="mt-6">
          <CategorizeTransactions />
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <CategorizationRules />
        </TabsContent>
      </Tabs>
    </div>
  );
}
