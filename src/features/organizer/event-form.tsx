import { useForm, useWatch } from "react-hook-form";
import { useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check } from "lucide-react";
import type { CampusEvent } from "../../types";
import { eventSchema, type EventFormValues } from "../../lib/schemas";
import { categories } from "../../types";
import { localDateInput } from "../../lib/utils";
import { useStore } from "../../app/store";
import { useToast } from "../../components/toast";
import { Field, Input } from "../../components/ui/field";
import { Button } from "../../components/ui/button";
const posterOptions = [
  { value: "build", label: "Cobalt grid" },
  { value: "design", label: "After hours" },
  { value: "ai", label: "Blue geometry" },
  { value: "startup", label: "Big energy" },
  { value: "photo", label: "A new lens" },
  { value: "music", label: "Night notes" },
] as const;
export function EventForm({
  event,
  onSaved,
}: {
  event?: CampusEvent;
  onSaved: () => void;
}) {
  const { saveEvent } = useStore();
  const toast = useToast();
  const submitLock = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues, unknown, ReturnType<typeof eventSchema.parse>>({
    resolver: zodResolver(eventSchema),
    mode: "onTouched",
    defaultValues: event
      ? {
          title: event.title,
          category: event.category,
          description: event.description,
          start: localDateInput(event.start),
          end: localDateInput(event.end),
          venue: event.venue,
          organizer: event.organizer,
          capacity: String(event.capacity),
          theme: event.theme,
        }
      : {
          title: "",
          category: "Technology",
          description: "",
          start: "",
          end: "",
          venue: "",
          organizer: "",
          capacity: "",
          theme: "build",
        },
  });
  const theme = useWatch({ control, name: "theme" });
  const attrs = (name: keyof EventFormValues) => ({
    id: `organizer-${name}`,
    "aria-required": true,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name]
      ? `organizer-${name}-error`
      : name === "description"
        ? "organizer-description-hint"
        : undefined,
  });
  const submit = (values: ReturnType<typeof eventSchema.parse>) => {
    if (submitLock.current) return;
    submitLock.current = true;
    try {
      saveEvent({ ...values, capacity: String(values.capacity) }, event?.id);
      toast(
        event
          ? "Your event has been updated."
          : "Your event is live in this browser. Let’s make a plan.",
      );
      onSaved();
    } catch (error) {
      submitLock.current = false;
      const message =
        error instanceof Error
          ? error.message
          : "Your event could not be saved.";
      if (message.startsWith("Capacity"))
        setError("capacity", { message }, { shouldFocus: true });
      else setError("root", { message });
    }
  };
  return (
    <form
      className="organizer-form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
    >
      <Field
        label="Event title"
        name="organizer-title"
        error={errors.title?.message}
      >
        <Input
          placeholder="Give your next great idea a name"
          {...register("title")}
          {...attrs("title")}
        />
      </Field>
      <div className="form-grid">
        <Field
          label="Category"
          name="organizer-category"
          error={errors.category?.message}
        >
          <select
            className="input"
            {...register("category")}
            {...attrs("category")}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Organizer name"
          name="organizer-organizer"
          error={errors.organizer?.message}
        >
          <Input
            placeholder="Your club or community"
            {...register("organizer")}
            {...attrs("organizer")}
          />
        </Field>
      </div>
      <Field
        label="The story behind it"
        name="organizer-description"
        error={errors.description?.message}
        hint="At least 40 characters. Tell people what they can expect."
      >
        <textarea
          className="input"
          rows={3}
          placeholder="What’s happening, who’s it for, and why should they come?"
          {...register("description")}
          {...attrs("description")}
        />
      </Field>
      <div className="form-grid">
        <Field
          label="Starts at"
          name="organizer-start"
          error={errors.start?.message}
        >
          <Input
            type="datetime-local"
            {...register("start")}
            {...attrs("start")}
          />
        </Field>
        <Field label="Ends at" name="organizer-end" error={errors.end?.message}>
          <Input type="datetime-local" {...register("end")} {...attrs("end")} />
        </Field>
      </div>
      <p className="field-hint">
        Dates and times use your device’s local time zone.
      </p>
      <div className="form-grid">
        <Field
          label="Venue"
          name="organizer-venue"
          error={errors.venue?.message}
        >
          <Input
            placeholder="e.g. Innovation Hub · Block A"
            {...register("venue")}
            {...attrs("venue")}
          />
        </Field>
        <Field
          label="Capacity"
          name="organizer-capacity"
          error={errors.capacity?.message}
        >
          <Input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 60"
            {...register("capacity")}
            {...attrs("capacity")}
          />
        </Field>
      </div>
      <fieldset className="poster-selector">
        <legend>
          Set the mood
          <span className="optional">Choose an original poster</span>
        </legend>
        <div>
          {posterOptions.map((p) => (
            <label
              key={p.value}
              className={theme === p.value ? "selected" : ""}
            >
              <input
                className="sr-only"
                type="radio"
                value={p.value}
                {...register("theme")}
              />
              <img src={`/posters/${p.value}.svg`} alt="" />
              <span>
                {p.label}
                {theme === p.value && <Check size={13} />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {errors.root && (
        <p className="form-alert" role="alert">
          {errors.root.message}
        </p>
      )}
      <div className="organizer-form-footer">
        <p>Demo event · Published in this browser only.</p>
        <Button disabled={isSubmitting} type="submit">
          {event ? "Save changes" : "Create event"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
