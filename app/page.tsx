import { Workspace } from "@/components/Workspace";
import { listProducts } from "@/lib/docs";

export default function Page() {
  return <Workspace products={listProducts()} />;
}
