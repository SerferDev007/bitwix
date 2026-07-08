
import { Card, CardContent } from "./ui/card";
import { CheckCircle, Users, Trophy, Clock } from "lucide-react";

export function About() {
  const features = [
    {
      icon: CheckCircle,
      title: "Quality Assurance",
      description: "We deliver high-quality solutions that meet industry standards and exceed client expectations."
    },
    {
      icon: Users,
      title: "Expert Team",
      description: "Our experienced professionals bring diverse skills and innovative approaches to every project."
    },
    {
      icon: Trophy,
      title: "Proven Results",
      description: "Track record of successful projects and satisfied clients across various industries."
    },
    {
      icon: Clock,
      title: "Timely Delivery",
      description: "We understand the importance of deadlines and ensure projects are completed on time."
    }
  ];

  return (
    <section id="about" className="py-20 bg-secondary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            About Bitwix Technologies
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Bitwix Technologies Private Limited is a leading technology company dedicated to 
            transforming businesses through innovative digital solutions. We specialize in 
            creating powerful websites and mobile applications that drive growth and success.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="bg-white rounded-lg p-8 md:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-6">Our Mission</h3>
              <p className="text-muted-foreground mb-6">
                To empower businesses with cutting-edge technology solutions that enhance their 
                digital presence, improve operational efficiency, and drive sustainable growth. 
                We are committed to delivering exceptional value through innovation, quality, 
                and customer-centric approach.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Custom solutions tailored to your needs</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Latest technologies and best practices</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Ongoing support and maintenance</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-6">Why Choose Us?</h3>
              <div className="space-y-4">
                <div className="bg-primary/5 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Innovation-Driven</h4>
                  <p className="text-sm text-muted-foreground">
                    We stay ahead of technology trends to provide you with modern, 
                    scalable solutions that give you a competitive edge.
                  </p>
                </div>
                <div className="bg-primary/5 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Client-Focused</h4>
                  <p className="text-sm text-muted-foreground">
                    Your success is our priority. We work closely with you throughout 
                    the development process to ensure your vision is realized.
                  </p>
                </div>
                <div className="bg-primary/5 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Quality First</h4>
                  <p className="text-sm text-muted-foreground">
                    Every project undergoes rigorous testing and quality assurance 
                    to deliver robust, reliable solutions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
