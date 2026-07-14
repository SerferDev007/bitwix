
import { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Phone, Mail, User } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { contentApi } from "../lib/api";

interface Member {
  name: string;
  role: string;
  description: string;
  image: string;
  skills: string[];
  contact: { phone: string; email: string };
}

// Rendered immediately and used as a fallback if the backend is unavailable.
const fallbackTeam: Member[] = [
  {
    name: "Amruta Shejul",
    role: "Managing Director & Founder",
    description: "Co-founder and Managing Director of Bitwix Technologies, driving the company vision, strategy, and growth. Leads operations and client partnerships to deliver reliable digital solutions.",
    image: "",
    skills: ["Business Strategy", "Leadership", "Operations", "Client Partnerships"],
    contact: { phone: "+91-8261861224", email: "support@bitwix.co.in" }
  },
  {
    name: "Sarita Palkudtewar",
    role: "CEO & Co-Founder",
    description: "Chief Executive Officer and Co-Founder of Bitwix Technologies, setting the strategic direction and driving the company growth, partnerships, and client success.",
    image: "",
    skills: ["Leadership", "Strategy", "Business Development", "Client Success"],
    contact: { phone: "+91-8261861224", email: "support@bitwix.co.in" }
  }
];

export function Team() {
  const [teamMembers, setTeamMembers] = useState<Member[]>(fallbackTeam);

  // Load live team members from the backend; keep static content on any failure.
  useEffect(() => {
    contentApi.team()
      .then((res) => {
        if (res.success && res.data && res.data.length) {
          setTeamMembers(res.data.map((m) => ({
            name: m.name,
            role: m.role,
            description: m.description || "",
            image: m.image_url || "",
            skills: m.skills || [],
            contact: { phone: m.phone || "+91-8261861224", email: m.email || "support@bitwix.co.in" },
          })));
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const handleCall = () => {
    window.location.href = "tel:+918261861224";
  };

  const handleEmailSupport = () => {
    window.location.href = "mailto:support@bitwix.co.in?subject=General Inquiry&body=Hello Bitwix Team,%0D%0A%0D%0AI would like to get in touch regarding your services.%0D%0A%0D%0AThank you.";
  };

  const handleEmailProject = (memberName: string) => {
    window.location.href = `mailto:support@bitwix.co.in?subject=Project Discussion with ${memberName}&body=Hello ${memberName},%0D%0A%0D%0AI would like to discuss a project with you. Please get back to me at your earliest convenience.%0D%0A%0D%0AThank you.`;
  };

  return (
    <section id="team" className="py-20 bg-secondary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Meet Our Team
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Our dedicated professionals bring expertise, passion, and commitment to every project. 
            Get to know the people who make Bitwix Technologies a trusted technology partner.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {teamMembers.map((member, index) => (
            <Card key={index} className="overflow-hidden hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* Image Section — photo if set, otherwise an initials avatar */}
                  <div className="relative h-64 md:h-full min-h-[16rem]">
                    {member.image ? (
                      <>
                        <ImageWithFallback
                          src={member.image}
                          alt={member.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                        <span className="text-5xl md:text-6xl font-bold text-primary/70">
                          {member.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content Section */}
                  <div className="p-6">
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-foreground mb-1">{member.name}</h3>
                      <p className="text-primary font-medium">{member.role}</p>
                    </div>

                    <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                      {member.description}
                    </p>

                    {/* Skills */}
                    <div className="mb-6">
                      <h4 className="font-medium mb-2">Expertise</h4>
                      <div className="flex flex-wrap gap-2">
                        {member.skills.map((skill, skillIndex) => (
                          <span
                            key={skillIndex}
                            className="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Contact Buttons */}
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        onClick={handleCall}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        <Phone className="h-4 w-4" />
                        Call {member.name}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEmailProject(member.name)}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        <Mail className="h-4 w-4" />
                        Email {member.name}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="bg-white rounded-lg p-8 text-center">
          <div className="max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Ready to Work With Our Team?
            </h3>
            <p className="text-muted-foreground mb-6">
              Our experienced professionals are ready to help bring your project to life. 
              Contact us today to discuss your requirements and get started.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={handleCall} className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Call Our Team
              </Button>
              <Button variant="outline" size="lg" onClick={handleEmailSupport} className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Send Message
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
