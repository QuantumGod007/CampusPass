export const student = {
  fullName: "  Aarya Deshmukh  ",
  email: "aarya@example.com",
  mobile: "+91 98765 43210",
  prn: "002026123456",
  department: "Computer Science",
  year: "Second year",
  note: "",
  consent: true,
};
export const organizerInput = () => ({
  title: "Creative Coding Evening",
  category: "Design",
  description:
    "An open studio evening to explore creative coding with your fellow campus makers.",
  start: new Date(Date.now() + 86400000 * 5).toISOString(),
  end: new Date(Date.now() + 86400000 * 5 + 7200000).toISOString(),
  venue: "Design Studio",
  organizer: "Creative Club",
  capacity: "50",
  theme: "design",
});
