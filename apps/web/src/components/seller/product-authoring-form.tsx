"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { categorySlugSchema } from "@shared/catalogue";
import { localeSchema, type Locale } from "@shared/localization";
import {
  createDraftProductRequestSchema,
  editDraftProductRequestSchema,
  type CreateDraftProductRequest,
  type EditDraftProductRequest,
  type SellerProductCompatibilityInput,
  type SellerProductDemoPageInput,
  type SellerProductDetailResponse,
  type SellerProductMediaInput,
  type SellerProductSpecificationInput,
} from "@shared/seller";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import {
  useFieldArray,
  useForm,
  type SubmitHandler,
  type UseFormRegister,
  type UseFormRegisterReturn,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createDraftProduct, editDraftProduct } from "@/lib/seller-client";

const CATEGORY_OPTIONS = categorySlugSchema.options;
const FORM_LOCALES = localeSchema.options;

const inputClassName =
  "h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Creates a draft product (`products/new`) or edits an owned draft's full
 * authoring content (`products/[id]`) — one component, two request shapes,
 * because the create step (design §5/§6) only ever accepts
 * `createDraftProductRequestSchema`'s five base fields, while translations/
 * media/compatibility/specifications/demo pages only exist on the edit
 * request once the product exists. Neither branch renders or submits a
 * `sellerId`, price-authority, `publicationState`, `isFeatured`, or
 * `reviewState` field — none of those fields exist on either shared request
 * schema, so this form has no way to send them even by mistake.
 */
export type ProductAuthoringFormProps =
  | {
      mode: "create";
      csrfToken: string;
      onSuccess: (product: SellerProductDetailResponse) => void;
    }
  | {
      mode: "edit";
      csrfToken: string;
      productId: string;
      initialProduct: SellerProductDetailResponse;
      onSuccess: (product: SellerProductDetailResponse) => void;
    };

export function ProductAuthoringForm(props: ProductAuthoringFormProps) {
  if (props.mode === "create") {
    return (
      <CreateProductForm
        csrfToken={props.csrfToken}
        onSuccess={props.onSuccess}
      />
    );
  }

  return (
    <EditProductForm
      csrfToken={props.csrfToken}
      initialProduct={props.initialProduct}
      onSuccess={props.onSuccess}
      productId={props.productId}
    />
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-destructive" id={id} role="alert">
      {message}
    </p>
  );
}

function TextField({
  id,
  errorId,
  label,
  error,
  type = "text",
  registration,
}: {
  id: string;
  errorId: string;
  label: string;
  error?: string;
  type?: "text" | "url";
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        className={inputClassName}
        id={id}
        type={type}
        {...registration}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

interface CreateProductFormProps {
  csrfToken: string;
  onSuccess: (product: SellerProductDetailResponse) => void;
}

function CreateProductForm({ csrfToken, onSuccess }: CreateProductFormProps) {
  const t = useTranslations("Seller.authoringForm");
  const slugId = useId();
  const slugErrorId = useId();
  const categoryId = useId();
  const thumbnailId = useId();
  const thumbnailErrorId = useId();
  const documentationId = useId();
  const documentationErrorId = useId();
  const previewId = useId();
  const previewErrorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateDraftProductRequest>({
    resolver: zodResolver(createDraftProductRequestSchema),
    defaultValues: {
      slug: "",
      category: CATEGORY_OPTIONS[0],
      thumbnailUrl: "",
      documentationUrl: "",
      isolatedPreviewUrl: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateDraftProductRequest) =>
      createDraftProduct(input, csrfToken),
    onSuccess,
  });

  const onSubmit: SubmitHandler<CreateDraftProductRequest> = (values) => {
    createMutation.mutate(values);
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <TextField
        error={errors.slug ? t("fields.slug.error") : undefined}
        errorId={slugErrorId}
        id={slugId}
        label={t("fields.slug.label")}
        registration={register("slug")}
      />

      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={categoryId}
        >
          {t("fields.category.label")}
        </label>
        <select
          className={inputClassName}
          id={categoryId}
          {...register("category")}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`categories.${option}`)}
            </option>
          ))}
        </select>
      </div>

      <TextField
        error={errors.thumbnailUrl ? t("fields.thumbnailUrl.error") : undefined}
        errorId={thumbnailErrorId}
        id={thumbnailId}
        label={t("fields.thumbnailUrl.label")}
        registration={register("thumbnailUrl")}
        type="url"
      />
      <TextField
        error={
          errors.documentationUrl
            ? t("fields.documentationUrl.error")
            : undefined
        }
        errorId={documentationErrorId}
        id={documentationId}
        label={t("fields.documentationUrl.label")}
        registration={register("documentationUrl")}
        type="url"
      />
      <TextField
        error={
          errors.isolatedPreviewUrl
            ? t("fields.isolatedPreviewUrl.error")
            : undefined
        }
        errorId={previewErrorId}
        id={previewId}
        label={t("fields.isolatedPreviewUrl.label")}
        registration={register("isolatedPreviewUrl")}
        type="url"
      />

      {createMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("submitError")}
        </p>
      ) : null}

      <Button disabled={isSubmitting || createMutation.isPending} type="submit">
        {createMutation.isPending ? t("creating") : t("createSubmit")}
      </Button>
    </form>
  );
}

function emptyMediaItem(position: number): SellerProductMediaInput {
  return {
    position,
    kind: "image",
    url: "",
    translations: FORM_LOCALES.map((locale) => ({ locale, alt: "" })),
  };
}

function emptyCompatibilityItem(): SellerProductCompatibilityInput {
  return { target: "", constraint: "" };
}

function emptySpecificationItem(): SellerProductSpecificationInput {
  return {
    key: "",
    translations: FORM_LOCALES.map((locale) => ({
      locale,
      label: "",
      value: "",
    })),
  };
}

function emptyDemoPageItem(position: number): SellerProductDemoPageInput {
  return {
    position,
    slug: "",
    previewUrl: "",
    translations: FORM_LOCALES.map((locale) => ({ locale, title: "" })),
  };
}

function buildTranslationDefaults(
  initialProduct: SellerProductDetailResponse,
): EditDraftProductRequest["translations"] {
  return FORM_LOCALES.map((locale) => {
    const existing = initialProduct.translations.find(
      (translation) => translation.locale === locale,
    );
    return {
      locale,
      title: existing?.title ?? "",
      summary: existing?.summary ?? "",
      description: existing?.description ?? "",
    };
  });
}

function buildEditDefaultValues(
  initialProduct: SellerProductDetailResponse,
): EditDraftProductRequest {
  return {
    category: initialProduct.category,
    tags: initialProduct.tags,
    thumbnailUrl: initialProduct.thumbnailUrl,
    documentationUrl: initialProduct.documentationUrl,
    isolatedPreviewUrl: initialProduct.isolatedPreviewUrl,
    translations: buildTranslationDefaults(initialProduct),
    media: initialProduct.media,
    compatibility: initialProduct.compatibility,
    specifications: initialProduct.specifications,
    demoPages: initialProduct.demoPages,
  };
}

interface EditProductFormProps {
  csrfToken: string;
  productId: string;
  initialProduct: SellerProductDetailResponse;
  onSuccess: (product: SellerProductDetailResponse) => void;
}

function EditProductForm({
  csrfToken,
  productId,
  initialProduct,
  onSuccess,
}: EditProductFormProps) {
  const t = useTranslations("Seller.authoringForm");
  const categoryId = useId();
  const thumbnailId = useId();
  const thumbnailErrorId = useId();
  const documentationId = useId();
  const documentationErrorId = useId();
  const previewId = useId();
  const previewErrorId = useId();
  const translationsBaseId = useId();
  const mediaBaseId = useId();
  const compatibilityBaseId = useId();
  const specificationsBaseId = useId();
  const demoPagesBaseId = useId();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditDraftProductRequest>({
    resolver: zodResolver(editDraftProductRequestSchema),
    defaultValues: buildEditDefaultValues(initialProduct),
  });

  const mediaArray = useFieldArray({ control, name: "media" });
  const compatibilityArray = useFieldArray({ control, name: "compatibility" });
  const specificationArray = useFieldArray({
    control,
    name: "specifications",
  });
  const demoPageArray = useFieldArray({ control, name: "demoPages" });

  const editMutation = useMutation({
    mutationFn: (input: EditDraftProductRequest) =>
      editDraftProduct(productId, input, csrfToken),
    onSuccess,
  });

  const onSubmit: SubmitHandler<EditDraftProductRequest> = (values) => {
    editMutation.mutate({
      ...values,
      media: (values.media ?? []).map((item, index) => ({
        ...item,
        position: index,
      })),
      demoPages: (values.demoPages ?? []).map((item, index) => ({
        ...item,
        position: index,
      })),
    });
  };

  const hasMediaError = Boolean(errors.media);
  const hasCompatibilityError = Boolean(errors.compatibility);
  const hasSpecificationsError = Boolean(errors.specifications);
  const hasDemoPagesError = Boolean(errors.demoPages);

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <div className="flex flex-col gap-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={categoryId}
        >
          {t("fields.category.label")}
        </label>
        <select
          className={inputClassName}
          id={categoryId}
          {...register("category")}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`categories.${option}`)}
            </option>
          ))}
        </select>
      </div>

      <TextField
        error={errors.thumbnailUrl ? t("fields.thumbnailUrl.error") : undefined}
        errorId={thumbnailErrorId}
        id={thumbnailId}
        label={t("fields.thumbnailUrl.label")}
        registration={register("thumbnailUrl")}
        type="url"
      />
      <TextField
        error={
          errors.documentationUrl
            ? t("fields.documentationUrl.error")
            : undefined
        }
        errorId={documentationErrorId}
        id={documentationId}
        label={t("fields.documentationUrl.label")}
        registration={register("documentationUrl")}
        type="url"
      />
      <TextField
        error={
          errors.isolatedPreviewUrl
            ? t("fields.isolatedPreviewUrl.error")
            : undefined
        }
        errorId={previewErrorId}
        id={previewId}
        label={t("fields.isolatedPreviewUrl.label")}
        registration={register("isolatedPreviewUrl")}
        type="url"
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold text-foreground">
          {t("sections.translations.heading")}
        </legend>
        {FORM_LOCALES.map((locale, index) => (
          <TranslationFields
            baseId={`${translationsBaseId}-${locale}`}
            index={index}
            key={locale}
            locale={locale}
            register={register}
          />
        ))}
      </fieldset>

      <RepeatableSection
        addLabel={t("sections.media.add")}
        baseId={mediaBaseId}
        emptyLabel={t("sections.media.empty")}
        error={hasMediaError ? t("sections.media.error") : undefined}
        heading={t("sections.media.heading")}
        onAdd={() =>
          mediaArray.append(emptyMediaItem(mediaArray.fields.length))
        }
      >
        {mediaArray.fields.map((field, index) => (
          <MediaItemFields
            baseId={`${mediaBaseId}-${index}`}
            index={index}
            key={field.id}
            onRemove={() => mediaArray.remove(index)}
            register={register}
            removeLabel={t("sections.media.remove")}
          />
        ))}
      </RepeatableSection>

      <RepeatableSection
        addLabel={t("sections.compatibility.add")}
        baseId={compatibilityBaseId}
        emptyLabel={t("sections.compatibility.empty")}
        error={
          hasCompatibilityError ? t("sections.compatibility.error") : undefined
        }
        heading={t("sections.compatibility.heading")}
        onAdd={() => compatibilityArray.append(emptyCompatibilityItem())}
      >
        {compatibilityArray.fields.map((field, index) => (
          <CompatibilityItemFields
            baseId={`${compatibilityBaseId}-${index}`}
            index={index}
            key={field.id}
            onRemove={() => compatibilityArray.remove(index)}
            register={register}
            removeLabel={t("sections.compatibility.remove")}
          />
        ))}
      </RepeatableSection>

      <RepeatableSection
        addLabel={t("sections.specifications.add")}
        baseId={specificationsBaseId}
        emptyLabel={t("sections.specifications.empty")}
        error={
          hasSpecificationsError
            ? t("sections.specifications.error")
            : undefined
        }
        heading={t("sections.specifications.heading")}
        onAdd={() => specificationArray.append(emptySpecificationItem())}
      >
        {specificationArray.fields.map((field, index) => (
          <SpecificationItemFields
            baseId={`${specificationsBaseId}-${index}`}
            index={index}
            key={field.id}
            onRemove={() => specificationArray.remove(index)}
            register={register}
            removeLabel={t("sections.specifications.remove")}
          />
        ))}
      </RepeatableSection>

      <RepeatableSection
        addLabel={t("sections.demoPages.add")}
        baseId={demoPagesBaseId}
        emptyLabel={t("sections.demoPages.empty")}
        error={hasDemoPagesError ? t("sections.demoPages.error") : undefined}
        heading={t("sections.demoPages.heading")}
        onAdd={() =>
          demoPageArray.append(emptyDemoPageItem(demoPageArray.fields.length))
        }
      >
        {demoPageArray.fields.map((field, index) => (
          <DemoPageItemFields
            baseId={`${demoPagesBaseId}-${index}`}
            index={index}
            key={field.id}
            onRemove={() => demoPageArray.remove(index)}
            register={register}
            removeLabel={t("sections.demoPages.remove")}
          />
        ))}
      </RepeatableSection>

      {editMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("submitError")}
        </p>
      ) : null}

      <Button disabled={isSubmitting || editMutation.isPending} type="submit">
        {editMutation.isPending ? t("saving") : t("saveSubmit")}
      </Button>
    </form>
  );
}

function RepeatableSection({
  baseId,
  heading,
  addLabel,
  emptyLabel,
  error,
  onAdd,
  children,
}: {
  baseId: string;
  heading: string;
  addLabel: string;
  emptyLabel: string;
  error?: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-semibold text-foreground">
        {heading}
      </legend>
      {hasChildren ? (
        <div className="flex flex-col gap-4">{children}</div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
      <FieldError id={`${baseId}-error`} message={error} />
      <Button onClick={onAdd} type="button" variant="outline">
        {addLabel}
      </Button>
    </fieldset>
  );
}

function TranslationFields({
  baseId,
  index,
  locale,
  register,
}: {
  baseId: string;
  index: number;
  locale: Locale;
  register: UseFormRegister<EditDraftProductRequest>;
}) {
  const t = useTranslations("Seller.authoringForm");

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border p-4">
      <p className="text-sm font-semibold text-foreground">
        {t(`locales.${locale}`)}
      </p>
      <input
        type="hidden"
        value={locale}
        {...register(`translations.${index}.locale` as const)}
      />
      <TextField
        errorId={`${baseId}-title-error`}
        id={`${baseId}-title`}
        label={t("fields.translationTitle.label")}
        registration={register(`translations.${index}.title` as const)}
      />
      <TextField
        errorId={`${baseId}-summary-error`}
        id={`${baseId}-summary`}
        label={t("fields.translationSummary.label")}
        registration={register(`translations.${index}.summary` as const)}
      />
      <TextField
        errorId={`${baseId}-description-error`}
        id={`${baseId}-description`}
        label={t("fields.translationDescription.label")}
        registration={register(`translations.${index}.description` as const)}
      />
    </div>
  );
}

function MediaItemFields({
  baseId,
  index,
  register,
  onRemove,
  removeLabel,
}: {
  baseId: string;
  index: number;
  register: UseFormRegister<EditDraftProductRequest>;
  onRemove: () => void;
  removeLabel: string;
}) {
  const t = useTranslations("Seller.authoringForm");
  const kindId = `${baseId}-kind`;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border p-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor={kindId}>
          {t("sections.media.kindLabel")}
        </label>
        <select
          className={inputClassName}
          id={kindId}
          {...register(`media.${index}.kind` as const)}
        >
          <option value="image">{t("sections.media.kindImage")}</option>
          <option value="video">{t("sections.media.kindVideo")}</option>
        </select>
      </div>
      <TextField
        errorId={`${baseId}-url-error`}
        id={`${baseId}-url`}
        label={t("sections.media.urlLabel")}
        registration={register(`media.${index}.url` as const)}
        type="url"
      />
      {FORM_LOCALES.map((locale, localeIndex) => (
        <TextField
          errorId={`${baseId}-alt-${locale}-error`}
          id={`${baseId}-alt-${locale}`}
          key={locale}
          label={t("sections.media.altLabel", {
            locale: t(`locales.${locale}`),
          })}
          registration={register(
            `media.${index}.translations.${localeIndex}.alt` as const,
          )}
        />
      ))}
      {FORM_LOCALES.map((locale, localeIndex) => (
        <input
          key={locale}
          type="hidden"
          value={locale}
          {...register(
            `media.${index}.translations.${localeIndex}.locale` as const,
          )}
        />
      ))}
      <Button onClick={onRemove} type="button" variant="outline">
        {removeLabel}
      </Button>
    </div>
  );
}

function CompatibilityItemFields({
  baseId,
  index,
  register,
  onRemove,
  removeLabel,
}: {
  baseId: string;
  index: number;
  register: UseFormRegister<EditDraftProductRequest>;
  onRemove: () => void;
  removeLabel: string;
}) {
  const t = useTranslations("Seller.authoringForm");

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border p-4">
      <TextField
        errorId={`${baseId}-target-error`}
        id={`${baseId}-target`}
        label={t("sections.compatibility.targetLabel")}
        registration={register(`compatibility.${index}.target` as const)}
      />
      <TextField
        errorId={`${baseId}-constraint-error`}
        id={`${baseId}-constraint`}
        label={t("sections.compatibility.constraintLabel")}
        registration={register(`compatibility.${index}.constraint` as const)}
      />
      <Button onClick={onRemove} type="button" variant="outline">
        {removeLabel}
      </Button>
    </div>
  );
}

function SpecificationItemFields({
  baseId,
  index,
  register,
  onRemove,
  removeLabel,
}: {
  baseId: string;
  index: number;
  register: UseFormRegister<EditDraftProductRequest>;
  onRemove: () => void;
  removeLabel: string;
}) {
  const t = useTranslations("Seller.authoringForm");

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border p-4">
      <TextField
        errorId={`${baseId}-key-error`}
        id={`${baseId}-key`}
        label={t("sections.specifications.keyLabel")}
        registration={register(`specifications.${index}.key` as const)}
      />
      {FORM_LOCALES.map((locale, localeIndex) => (
        <div className="flex flex-col gap-3" key={locale}>
          <input
            type="hidden"
            value={locale}
            {...register(
              `specifications.${index}.translations.${localeIndex}.locale` as const,
            )}
          />
          <TextField
            errorId={`${baseId}-label-${locale}-error`}
            id={`${baseId}-label-${locale}`}
            label={t("sections.specifications.labelLabel", {
              locale: t(`locales.${locale}`),
            })}
            registration={register(
              `specifications.${index}.translations.${localeIndex}.label` as const,
            )}
          />
          <TextField
            errorId={`${baseId}-value-${locale}-error`}
            id={`${baseId}-value-${locale}`}
            label={t("sections.specifications.valueLabel", {
              locale: t(`locales.${locale}`),
            })}
            registration={register(
              `specifications.${index}.translations.${localeIndex}.value` as const,
            )}
          />
        </div>
      ))}
      <Button onClick={onRemove} type="button" variant="outline">
        {removeLabel}
      </Button>
    </div>
  );
}

function DemoPageItemFields({
  baseId,
  index,
  register,
  onRemove,
  removeLabel,
}: {
  baseId: string;
  index: number;
  register: UseFormRegister<EditDraftProductRequest>;
  onRemove: () => void;
  removeLabel: string;
}) {
  const t = useTranslations("Seller.authoringForm");

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border p-4">
      <TextField
        errorId={`${baseId}-slug-error`}
        id={`${baseId}-slug`}
        label={t("sections.demoPages.slugLabel")}
        registration={register(`demoPages.${index}.slug` as const)}
      />
      <TextField
        errorId={`${baseId}-previewUrl-error`}
        id={`${baseId}-previewUrl`}
        label={t("sections.demoPages.previewUrlLabel")}
        registration={register(`demoPages.${index}.previewUrl` as const)}
        type="url"
      />
      {FORM_LOCALES.map((locale, localeIndex) => (
        <input
          key={locale}
          type="hidden"
          value={locale}
          {...register(
            `demoPages.${index}.translations.${localeIndex}.locale` as const,
          )}
        />
      ))}
      {FORM_LOCALES.map((locale, localeIndex) => (
        <TextField
          errorId={`${baseId}-title-${locale}-error`}
          id={`${baseId}-title-${locale}`}
          key={locale}
          label={t("sections.demoPages.titleLabel", {
            locale: t(`locales.${locale}`),
          })}
          registration={register(
            `demoPages.${index}.translations.${localeIndex}.title` as const,
          )}
        />
      ))}
      <Button onClick={onRemove} type="button" variant="outline">
        {removeLabel}
      </Button>
    </div>
  );
}
