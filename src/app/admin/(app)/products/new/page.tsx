import { BackLink } from "../../ui";
import ProductForm from "../ProductForm";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "New product - Aalmaram admin" };

export default async function NewProductPage() {
  await requireAdmin();

  return (
    <div>
      <BackLink href="/admin/products">Products</BackLink>
      <h1
        className="mt-5 font-semibold text-[26px]"
        style={{ color: "var(--night)" }}
      >
        New product
      </h1>
      <p className="mt-3 text-[14px] opacity-70">
        Images can be added once it exists. It stays a draft until you set it active.
      </p>

      <ProductForm
        mode="create"
        values={{
          title: "",
          handle: "",
          subtitle: "",
          descriptionMd: "",
          status: "draft",
          tags: "",
          productType: "",
          vendor: "",
          hsnCode: "4901",
          seoTitle: "",
          seoDescription: "",
          price: "",
          compareAt: "",
          cost: "",
          sku: "",
          barcode: "",
          inventoryQuantity: "0",
          weightGrams: "0",
          lengthCm: "0",
          breadthCm: "0",
          heightCm: "0",
        }}
      />
    </div>
  );
}
